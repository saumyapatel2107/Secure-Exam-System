export interface Question {
  id: string;
  text: string;
  options: string[];
}

export interface Exam {
  id: string;
  title: string;
  questions: Question[];
  durationMinutes: number;
}

export interface SolutionKey {
  [questionId: string]: number; // index of correct option
}

export interface ExamResult {
  studentName: string;
  studentClass: string;
  responses: { [questionId: string]: number };
  score: number;
  totalMarks: number;
  timestamp: string;
  terminated: boolean;
}
