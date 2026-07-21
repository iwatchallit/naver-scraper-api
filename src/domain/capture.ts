export type CaptureState = "captured" | "absent" | "not-captured" | "invalid-json";

export interface BenefitsCaptureResult {
  state: CaptureState;
  status: number | null;
  raw?: unknown;
}

export interface ProductDetailsCaptureResult {
  state: CaptureState;
  status: number | null;
  channelUid: string | null;
  raw?: unknown;
}

export interface NaverCaptureResult {
  benefits: BenefitsCaptureResult;
  productDetails: ProductDetailsCaptureResult;
}

export function createEmptyCaptureResult(): NaverCaptureResult {
  return {
    benefits: {
      state: "not-captured",
      status: null
    },
    productDetails: {
      state: "not-captured",
      status: null,
      channelUid: null
    }
  };
}
