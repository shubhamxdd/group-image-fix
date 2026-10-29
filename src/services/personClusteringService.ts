import * as Crypto from "expo-crypto";
import { DetectedFace, Person } from "../types/detection";
import { cosineSimilarity, computeCentroid } from "./faceEmbeddingService";

export const DEFAULT_SIMILARITY_THRESHOLD = 0.52;
export const DEFAULT_SPATIAL_SIMILARITY_THRESHOLD = 0.48;

export function computeSpatialSimilarity(
  a: DetectedFace,
  b: DetectedFace
): number {
  const centerXA = a.bounds.x + a.bounds.width / 2;
  const centerXB = b.bounds.x + b.bounds.width / 2;
  const centerYA = a.bounds.y + a.bounds.height / 2;
  const centerYB = b.bounds.y + b.bounds.height / 2;

  const dx = Math.abs(centerXA - centerXB);
  const dy = Math.abs(centerYA - centerYB);

  // In burst photos, people remain in roughly the same relative spot
  const score = Math.max(0, 1 - (dx * 2.5 + dy * 1.5));
  return Number(score.toFixed(4));
}

interface InternalCluster {
  id: string;
  faceIds: string[];
  embeddings: number[][];
  representativeEmbedding: number[];
}

export function clusterFacesIntoPersons(
  faces: DetectedFace[],
  basePhotoId: string | null,
  options?: {
    similarityThreshold?: number;
    spatialThreshold?: number;
  }
): { persons: Person[]; updatedFaces: Record<string, DetectedFace> } {
  if (faces.length === 0) {
    return { persons: [], updatedFaces: {} };
  }

  const effectiveSimilarityThreshold =
    options?.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  const effectiveSpatialThreshold =
    options?.spatialThreshold ??
    Math.max(0.4, effectiveSimilarityThreshold - 0.04);

  // Create lookup for faces by ID early
  const faceMap: Record<string, DetectedFace> = {};
  for (const f of faces) {
    faceMap[f.id] = { ...f };
  }

  // Group faces by photoId preserving photo sequence
  const photoIdSet = new Set<string>();
  const facesByPhoto = new Map<string, DetectedFace[]>();

  // Ensure basePhoto comes first if present
  if (basePhotoId) {
    photoIdSet.add(basePhotoId);
  }
  for (const face of faces) {
    photoIdSet.add(face.photoId);
  }

  for (const photoId of photoIdSet) {
    const list = faces.filter((f) => f.photoId === photoId);
    if (list.length > 0) {
      facesByPhoto.set(photoId, list);
    }
  }

  const clusters: InternalCluster[] = [];

  function computePairSimilarity(
    cluster: InternalCluster,
    face: DetectedFace
  ): number {
    if (
      cluster.representativeEmbedding.length > 0 &&
      face.embedding &&
      face.embedding.length > 0
    ) {
      const centroidSim = cosineSimilarity(
        cluster.representativeEmbedding,
        face.embedding
      );
      let maxMemberSim = 0;
      for (const emb of cluster.embeddings) {
        const sim = cosineSimilarity(emb, face.embedding);
        if (sim > maxMemberSim) {
          maxMemberSim = sim;
        }
      }
      return Math.max(centroidSim, maxMemberSim);
    }

    // Fall back to spatial similarity using member faces
    let maxSpatial = 0;
    for (const memberId of cluster.faceIds) {
      const member = faceMap[memberId];
      if (member) {
        const sim = computeSpatialSimilarity(member, face);
        if (sim > maxSpatial) {
          maxSpatial = sim;
        }
      }
    }
    return maxSpatial;
  }

  // Iterate photo by photo
  for (const [, photoFaces] of facesByPhoto.entries()) {
    if (clusters.length === 0) {
      // First photo: every face initializes a person cluster
      for (const face of photoFaces) {
        clusters.push({
          id: Crypto.randomUUID(),
          faceIds: [face.id],
          embeddings: face.embedding ? [face.embedding] : [],
          representativeEmbedding: face.embedding || [],
        });
      }
      continue;
    }

    // Build bipartite similarity matrix between existing clusters and candidate faces
    interface MatchPair {
      clusterIndex: number;
      faceIndex: number;
      similarity: number;
    }

    const pairs: MatchPair[] = [];
    for (let cIdx = 0; cIdx < clusters.length; cIdx++) {
      for (let fIdx = 0; fIdx < photoFaces.length; fIdx++) {
        const face = photoFaces[fIdx];
        const sim = computePairSimilarity(clusters[cIdx], face);
        const hasEmbedding =
          clusters[cIdx].representativeEmbedding.length > 0 &&
          !!face.embedding;
        const threshold = hasEmbedding
          ? effectiveSimilarityThreshold
          : effectiveSpatialThreshold;

        if (sim >= threshold) {
          pairs.push({ clusterIndex: cIdx, faceIndex: fIdx, similarity: sim });
        }
      }
    }

    // Sort candidate pairs descending by similarity for greedy optimal bipartite matching
    pairs.sort((a, b) => b.similarity - a.similarity);

    const matchedClusters = new Set<number>();
    const matchedFaces = new Set<number>();

    for (const pair of pairs) {
      if (
        matchedClusters.has(pair.clusterIndex) ||
        matchedFaces.has(pair.faceIndex)
      ) {
        continue;
      }

      // Assign face to cluster
      const cluster = clusters[pair.clusterIndex];
      const face = photoFaces[pair.faceIndex];
      cluster.faceIds.push(face.id);
      if (face.embedding) {
        cluster.embeddings.push(face.embedding);
        cluster.representativeEmbedding = computeCentroid(cluster.embeddings);
      }

      matchedClusters.add(pair.clusterIndex);
      matchedFaces.add(pair.faceIndex);
    }

    // Any unassigned face in this photo creates a new person cluster
    for (let fIdx = 0; fIdx < photoFaces.length; fIdx++) {
      if (!matchedFaces.has(fIdx)) {
        const face = photoFaces[fIdx];
        clusters.push({
          id: Crypto.randomUUID(),
          faceIds: [face.id],
          embeddings: face.embedding ? [face.embedding] : [],
          representativeEmbedding: face.embedding || [],
        });
      }
    }
  }

  // Second pass: post clustering merge
  // If two clusters never appear in the same photo and meet the similarity threshold, merge them.
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const c1 = clusters[i];
        const c2 = clusters[j];

        const c1Photos = new Set(c1.faceIds.map((id) => faceMap[id]?.photoId));
        let sharePhoto = false;
        for (const id of c2.faceIds) {
          const pId = faceMap[id]?.photoId;
          if (pId && c1Photos.has(pId)) {
            sharePhoto = true;
            break;
          }
        }

        if (sharePhoto) {
          continue;
        }

        let sim = 0;
        if (
          c1.representativeEmbedding.length > 0 &&
          c2.representativeEmbedding.length > 0
        ) {
          const centroidSim = cosineSimilarity(
            c1.representativeEmbedding,
            c2.representativeEmbedding
          );
          let maxMemberSim = 0;
          for (const emb1 of c1.embeddings) {
            for (const emb2 of c2.embeddings) {
              const s = cosineSimilarity(emb1, emb2);
              if (s > maxMemberSim) {
                maxMemberSim = s;
              }
            }
          }
          sim = Math.max(centroidSim, maxMemberSim);
        } else {
          for (const id1 of c1.faceIds) {
            for (const id2 of c2.faceIds) {
              const f1 = faceMap[id1];
              const f2 = faceMap[id2];
              if (f1 && f2) {
                const s = computeSpatialSimilarity(f1, f2);
                if (s > sim) {
                  sim = s;
                }
              }
            }
          }
        }

        const requiredThreshold =
          c1.representativeEmbedding.length > 0 &&
          c2.representativeEmbedding.length > 0
            ? effectiveSimilarityThreshold
            : effectiveSpatialThreshold;

        if (sim >= requiredThreshold) {
          c1.faceIds.push(...c2.faceIds);
          c1.embeddings.push(...c2.embeddings);
          if (c1.embeddings.length > 0) {
            c1.representativeEmbedding = computeCentroid(c1.embeddings);
          }
          clusters.splice(j, 1);
          mergedAny = true;
          break;
        }
      }
      if (mergedAny) {
        break;
      }
    }
  }

  // Calculate sort key for each person cluster:
  // 1. Base photo horizontal center X (bounds.x + bounds.width / 2)
  // 2. Or average horizontal center X on alternate photos (offset with +10 so they append after base faces)
  interface ClusterSortInfo {
    cluster: InternalCluster;
    sortKey: number;
    bestFaceId: string | null;
  }

  const sortedClusterInfos: ClusterSortInfo[] = clusters.map((c) => {
    let bestFaceId: string | null = null;
    let highestScore = -1;

    let basePhotoX: number | null = null;
    let altSumX = 0;
    let altCount = 0;

    for (const faceId of c.faceIds) {
      const face = faceMap[faceId];
      if (!face) continue;

      if (face.qualityScore > highestScore) {
        highestScore = face.qualityScore;
        bestFaceId = face.id;
      }

      const centerX = face.bounds.x + face.bounds.width / 2;
      if (basePhotoId && face.photoId === basePhotoId) {
        basePhotoX = centerX;
      } else {
        altSumX += centerX;
        altCount++;
      }
    }

    let sortKey: number;
    if (basePhotoX !== null) {
      sortKey = basePhotoX;
    } else if (altCount > 0) {
      sortKey = 10.0 + altSumX / altCount;
    } else {
      sortKey = 99.0;
    }

    return { cluster: c, sortKey, bestFaceId };
  });

  // Sort left to right
  sortedClusterInfos.sort((a, b) => a.sortKey - b.sortKey);

  // Assign sequential labels and update face personId
  const persons: Person[] = sortedClusterInfos.map((info, idx) => {
    const personId = info.cluster.id;
    for (const faceId of info.cluster.faceIds) {
      if (faceMap[faceId]) {
        faceMap[faceId].personId = personId;
      }
    }

    const bestFace = info.bestFaceId ? faceMap[info.bestFaceId] : null;
    const thumbnailUri =
      bestFace?.cropUri ||
      info.cluster.faceIds
        .map((id) => faceMap[id]?.cropUri)
        .find((uri) => !!uri) ||
      undefined;

    return {
      id: personId,
      label: `Person ${idx + 1}`,
      faceIds: info.cluster.faceIds,
      bestFaceId: info.bestFaceId,
      thumbnailUri,
      representativeEmbedding: info.cluster.representativeEmbedding,
    };
  });

  return { persons, updatedFaces: faceMap };
}
