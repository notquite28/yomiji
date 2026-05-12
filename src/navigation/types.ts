export type RootStackParamList = {
  Login: undefined;
  Dashboard: undefined;
  Settings: undefined;
  Diagnostics: undefined;
  RadicalImagePreview: undefined;
  ReviewSession: { practiceSource?: 'recentMistakes' | 'apprenticeLeeches' | 'allLeeches' | 'burnedItems' } | undefined;
  LessonSession: { selectedIds?: number[] };
  LessonPicker: undefined;
  SubjectCatalog: { level: number };
  SubjectSearch: undefined;
  SubjectDetail: { subjectId: number };
};
