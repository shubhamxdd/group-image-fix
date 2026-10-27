import * as Crypto from "expo-crypto";
import { DetectedFace, Person } from "../types/detection";
import { cosineSimilarity, computeCentroid } from "./faceEmbeddingService";

const SIMILARITY_THRESHOLD = 0.65;

interface InternalCluster {
  id: string;
  faceIds: string[];
  embeddings: number[][];
  representativeEmbedding: number[];
}

export function clusterFacesIntoPersons(
  faces: DetectedFace[],
  basePhotoId: string | null
): { persons: Person[]; updatedFaces: Record<string, DetectedFace> } {
  if (faces.length === 0) {
    return { persons: [], updatedFaces: {} };
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

  // Iterate photo by photo
  for (const [, photoFaces] of facesByPhoto.entries()) {
    if (clusters.length === 0) {
      // First photo: every face initializes a person cluster
      for (const face of photoFaces) {
        if (!face.embedding) continue;
        clusters.push({
          id: Crypto.randomUUID(),
          faceIds: [face.id],
          embeddings: [face.embedding],
          representativeEmbedding: face.embedding,
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
        if (!face.embedding) continue;
        const sim = cosineSimilarity(
          clusters[cIdx].representativeEmbedding,
          face.embedding
        );
        if (sim >= SIMILARITY_THRESHOLD) {
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
        if (!face.embedding) continue;
        clusters.push({
          id: Crypto.randomUUID(),
          faceIds: [face.id],
          embeddings: [face.embedding],
          representativeEmbedding: face.embedding,
        });
      }
    }
  }

  // Create lookup for faces by ID
  const faceMap: Record<string, DetectedFace> = {};
  for (const f of faces) {
    faceMap[f.id] = { ...f };
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

    return {
      id: personId,
      label: `Person ${idx + 1}`,
      faceIds: info.cluster.faceIds,
      bestFaceId: info.bestFaceId,
      representativeEmbedding: info.cluster.representativeEmbedding,
    };
  });

  return { persons, updatedFaces: faceMap };
}
