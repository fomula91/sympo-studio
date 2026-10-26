import { describe, expect, it } from 'vitest';
import type { DocumentInfo, StudioDocument } from '../model/types';
import { documentAvailability, toPreviewDocuments } from './document-presentation';

const document: StudioDocument = {
  id: 1, sessionId: null, displayName: '자료', tag: null, status: 'ready', hasFile: true,
  contentType: 'application/pdf', sizeBytes: 2048, pageCount: null, uploadedAt: null,
};
describe('자료 업로드 상태와 미리보기 열람 가능 여부', () => {
  it('업로드한 자료는 URL 없는 미리보기에서도 업로드 완료 상태를 유지한다', () => {
    const [preview] = toPreviewDocuments([document]);
    expect(preview).toMatchObject({ hasFile: true, sizeBytes: 2048, url: null });
    expect(documentAvailability(preview)).toEqual({ uploaded: true, canOpen: false });
  });
  it('미업로드 자료는 준비 중 상태를 유지한다', () => {
    const [preview] = toPreviewDocuments([{ ...document, hasFile: false, status: 'pending' }]);
    expect(documentAvailability(preview)).toEqual({ uploaded: false, canOpen: false });
  });
  it('공개 자료는 기존 API의 URL로 열람 가능 여부를 판단한다', () => {
    const publicDocument: DocumentInfo = { id: 1, name: '자료', status: 'ready', pages: null, url: '/file.pdf' };
    expect(documentAvailability(publicDocument)).toEqual({ uploaded: true, canOpen: true });
    expect(documentAvailability({ ...publicDocument, url: null })).toEqual({ uploaded: false, canOpen: false });
  });
});
