

// 아래 수치는 실측이 아닌 샘플입니다. 리포트 층은 "어떤 지표를 봐야 하는가"를 보여주기 위한 화면입니다.
export const METRICS = [
  { label: '행사 셋업 소요시간', value: '7분 40초', before: '42분', delta: '−82%' },
  { label: '설문 응답률', value: '66%', before: '42%', delta: '+24pt' },
  { label: '모바일 이탈률', value: '13%', before: '38%', delta: '−25pt' },
  { label: '색상 AA 통과율', value: '100%', before: '미측정', delta: '게이트' },
];

export const OPS = [
  { label: '특정 행사 진입 클릭 수', before: '4.6회', after: '2회' },
  { label: '편집 → 프리뷰 반영', before: '12초', after: '즉시' },
  { label: '색상 입력 횟수', before: '12회', after: '0회' },
  { label: '저장 실패율', before: '미측정', after: '0.04%' },
  { label: '아젠다 재제작', before: '이미지 재작업', after: '필드 수정' },
];
