// 에디터 섹션·콘솔 정렬 기준·미리보기 기기 — StudioState를 손으로 나눠 쓰는 여러
// 파일(app/providers/studio, widgets/studio-shell, pages/console, pages/editor)이
// 공유하는 리터럴 유니언. 한 곳에서만 정의해, 값이 하나 늘거나 바뀔 때 어느 한
// 사본만 고쳐 타입은 통과하는데 실제로는 어긋나는 일을 막는다(리뷰 발견).
export type Section = 'basic' | 'agenda' | 'docs' | 'engage' | 'theme';
export type SortKey = '최신' | '행사일' | '이름';
export type Device = 'mobile' | 'tablet';
