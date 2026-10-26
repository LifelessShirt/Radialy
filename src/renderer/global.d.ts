import type { Api, OverlayApi } from '../shared/types';

declare global {
  interface Window {
    api: Api;
    overlay: OverlayApi;
  }
}
export {};
