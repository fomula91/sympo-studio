import type { DocumentInfo, StudioDocument } from '../model/types';

// 업로드 여부와 미리보기의 서명 URL 부재는 다른 상태다.
export function toPreviewDocuments(documents: StudioDocument[]): DocumentInfo[] {
  return documents.map((document) => ({
    id: document.id,
    name: document.displayName,
    status: document.status,
    pages: document.pageCount,
    sizeBytes: document.sizeBytes,
    hasFile: document.hasFile,
    url: null,
  }));
}

export function documentAvailability(document: DocumentInfo) {
  const uploaded = document.status !== 'pending' && (document.hasFile ?? Boolean(document.url));
  return { uploaded, canOpen: uploaded && Boolean(document.url) };
}
