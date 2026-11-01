export interface BlendParameters {
  featherRadius: number;
  colorTransferEnabled: boolean;
  affineMatrix: number[];
}

export interface FaceSwapSelection {
  personId: string;
  donorFaceId: string;
  donorPhotoId: string;
  blendParams: BlendParameters;
  appliedAt: number;
}

export interface BlendResult {
  previewUri: string;
  previewWidth: number;
  previewHeight: number;
  isDirty: boolean;
  renderDurationMs: number;
}
