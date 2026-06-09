export interface ReviewFile {
  path: string;
  original: string;
  proposed: string;
  description?: string;
  language?: string;
}

export interface ReviewRequest {
  id: string;
  title: string;
  files: ReviewFile[];
}

export type FileStatus = 'pending' | 'approved' | 'rejected';

export interface ReviewResultFile {
  path: string;
  status: 'approved' | 'rejected';
  final: string;
}

export interface ReviewResult {
  id: string;
  status: 'approved' | 'rejected';
  files: ReviewResultFile[];
}

/** Внутреннее состояние одного файла в ревью */
export interface DiffSession {
  reviewId: string;
  filePath: string;
  originalFsPath: string;   // путь к оригинальному файлу на диске
  tmpFsPath: string;        // путь к временному файлу с proposed-контентом
  status: FileStatus;
}
