import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import { 
  Shield, 
  BookOpen, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  User, 
  GraduationCap,
  Save,
  ChevronRight,
  ChevronLeft,
  Send,
  FileText,
  Loader2,
  Mail,
  Zap,
  Lock,
  Eye,
  Trophy
} from 'lucide-react';
import { cn } from './lib/utils';
import { Exam, Question, SolutionKey, ExamResult } from './types';
import { GoogleGenAI, Type } from "@google/genai";

// --- Components ---

const Card = ({ children, className, onClick, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div 
    onClick={onClick}
    className={cn(
      "bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden", 
      onClick && "cursor-pointer hover:border-zinc-400 transition-all",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className,
  disabled,
  type = 'button'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) => {
  const variants = {
    primary: "bg-black text-white hover:bg-zinc-800",
    secondary: "bg-zinc-100 text-zinc-900 hover:bg-zinc-200",
    danger: "bg-red-500 text-white hover:bg-red-600",
    ghost: "bg-transparent text-zinc-600 hover:bg-zinc-100"
  };

  return (
    <button 
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "px-6 py-2.5 rounded-xl font-medium transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2",
        variants[variant],
        className
      )}
    >
      {children}
    </button>
  );
};

const Input = ({ 
  label, 
  value, 
  onChange, 
  placeholder, 
  type = 'text',
  required 
}: { 
  label: string; 
  value: string | number; 
  onChange: (val: string) => void; 
  placeholder?: string;
  type?: string;
  required?: boolean;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-zinc-700">{label}</label>
    <input 
      type={type}
      required={required}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 focus:outline-none focus:ring-2 focus:ring-black/5 focus:border-black transition-all"
    />
  </div>
);

const FileUpload = ({ 
  label, 
  onFileSelect, 
  accept = ".pdf",
  fileName
}: { 
  label: string; 
  onFileSelect: (file: File) => void;
  accept?: string;
  fileName?: string;
}) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-zinc-700">{label}</label>
    <div className="relative group">
      <input 
        type="file" 
        accept={accept}
        onChange={(e) => e.target.files?.[0] && onFileSelect(e.target.files[0])}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed transition-all",
        fileName ? "border-black bg-zinc-50" : "border-zinc-200 group-hover:border-zinc-400"
      )}>
        <Upload className={cn("w-5 h-5", fileName ? "text-black" : "text-zinc-400")} />
        <span className={cn("text-sm", fileName ? "text-black font-medium" : "text-zinc-500")}>
          {fileName || "Click or drag PDF to upload"}
        </span>
      </div>
    </div>
  </div>
);

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'landing' | 'examiner' | 'student-reg' | 'exam' | 'result'>('landing');
  const [exam, setExam] = useState<Exam | null>(null);
  const [solutionKey, setSolutionKey] = useState<SolutionKey | null>(null);
  const [studentInfo, setStudentInfo] = useState({ name: '', class: '' });
  const [responses, setResponses] = useState<{ [key: string]: number }>({});
  const [timeLeft, setTimeLeft] = useState(0);
  const [finalResult, setFinalResult] = useState<{ score: number; totalMarks: number; terminated: boolean; resultStatus?: string; solutionKey?: SolutionKey } | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  
  // Examiner form state
  const [examTitle, setExamTitle] = useState('');
  const [examDuration, setExamDuration] = useState('30');
  const [examinerEmail, setExaminerEmail] = useState('');
  const [questionFile, setQuestionFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<Question[]>([]);
  const [extractedKey, setExtractedKey] = useState<SolutionKey | null>(null);

  // Exam taking state
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [showReview, setShowReview] = useState(false);

  // --- Examiner Logic ---
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleProcessPDFs = async () => {
    if (!questionFile || !examTitle || !examinerEmail) {
      alert("Please fill all fields and upload the Question Paper.");
      return;
    }

    setIsProcessing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";

      const qBase64 = await fileToBase64(questionFile);

      const prompt = `
        I have a PDF file which is a question paper with multiple choice questions (MCQs).
        
        Please extract all the questions from the PDF and identify the correct answer for each question. 
        The correct answer might be explicitly marked in the PDF (e.g., bolded, underlined, or with a checkmark), 
        or you should determine the correct answer by solving the question if it's a factual or logical problem.
        
        Return the data in the following JSON format:
        {
          "questions": [
            { "id": "q1", "text": "Question text here", "options": ["Option A", "Option B", "Option C", "Option D"] }
          ],
          "solutionKey": { "q1": 0 } // index of the correct option (0-based)
        }
        
        Ensure the question IDs match between the questions array and the solutionKey object.
      `;

      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "application/pdf", data: qBase64 } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    text: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["id", "text", "options"]
                }
              },
              solutionKey: {
                type: Type.OBJECT,
                additionalProperties: { type: Type.INTEGER }
              }
            },
            required: ["questions", "solutionKey"]
          }
        }
      });

      const data = JSON.parse(response.text || "{}");
      setExtractedQuestions(data.questions);
      setExtractedKey(data.solutionKey);

    } catch (e) {
      console.error(e);
      alert("Failed to process PDFs. Please ensure they are clear and contain MCQs.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveExam = async () => {
    if (!extractedQuestions.length || !extractedKey) return;

    const shuffledQuestions = extractedQuestions.map(q => {
      const originalOptions = [...q.options];
      const correctOptionText = originalOptions[extractedKey[q.id]];
      
      const shuffledOptions = [...originalOptions].sort(() => Math.random() - 0.5);
      const newCorrectIdx = shuffledOptions.indexOf(correctOptionText);
      
      return {
        question: { ...q, options: shuffledOptions },
        newCorrectIdx
      };
    });

    const newSolutionKey: SolutionKey = {};
    shuffledQuestions.forEach(sq => {
      newSolutionKey[sq.question.id] = sq.newCorrectIdx;
    });

    const newExam: Exam = {
      id: 'exam-' + Math.random().toString(36).substr(2, 9),
      title: examTitle,
      questions: shuffledQuestions.map(sq => sq.question),
      durationMinutes: parseInt(examDuration)
    };

    setExam(newExam);
    setSolutionKey(newSolutionKey);
    
    // Save to server
    const saveRes = await fetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newExam, solutionKey: newSolutionKey, examinerEmail })
    });

    if (saveRes.ok) {
      setIsSaved(true);
    } else {
      alert("Failed to save exam to server");
    }
  };

  // --- Student Logic ---
  const startExam = () => {
    if (!exam) return;
    setTimeLeft(exam.durationMinutes * 60);
    setView('exam');
    setCurrentQuestionIdx(0);
    setShowReview(false);
    
    // Enter Fullscreen
    document.documentElement.requestFullscreen().catch(() => {});
  };

  const submitExam = useCallback(async (terminated = false) => {
    if (!exam || !studentInfo.name) return;

    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        examId: exam.id,
        studentName: studentInfo.name,
        studentClass: studentInfo.class,
        responses,
        terminated
      })
    });

    const resultData = await res.json();
    setFinalResult({ ...resultData, terminated });
    setView('result');
    
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  }, [exam, studentInfo, responses]);

  // --- Security Measures ---
  useEffect(() => {
    if (view !== 'exam') return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        submitExam(true);
      }
    };

    const handleBlur = () => {
      submitExam(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [view, submitExam]);

  // --- Timer ---
  useEffect(() => {
    if (view !== 'exam' || timeLeft <= 0) {
      if (view === 'exam' && timeLeft <= 0) submitExam();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [view, timeLeft, submitExam]);

  const progress = exam ? (Object.keys(responses).length / exam.questions.length) * 100 : 0;

  // Keyboard navigation
  useEffect(() => {
    if (view !== 'exam' || showReview) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        if (currentQuestionIdx < exam!.questions.length - 1) {
          setCurrentQuestionIdx(prev => prev + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        if (currentQuestionIdx > 0) {
          setCurrentQuestionIdx(prev => prev - 1);
        }
      } else if (['1', '2', '3', '4'].includes(e.key)) {
        const optionIdx = parseInt(e.key) - 1;
        const question = exam!.questions[currentQuestionIdx];
        if (optionIdx < question.options.length) {
          setResponses(prev => ({ ...prev, [question.id]: optionIdx }));
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, showReview, currentQuestionIdx, exam]);

  // Confetti on pass
  useEffect(() => {
    if (view === 'result' && finalResult?.resultStatus === 'PASS') {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          return clearInterval(interval);
        }

        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);

      return () => clearInterval(interval);
    }
  }, [view, finalResult]);

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-zinc-900 font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="border-b border-black/5 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg tracking-tight cursor-pointer" onClick={() => setView('landing')}>
            <Shield className="w-6 h-6" />
            <span>SECURE EXAM</span>
          </div>
          {view === 'exam' && exam && (
            <div className="flex items-center gap-6">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Monitoring Active
              </div>
              <div className="hidden md:flex flex-col items-end gap-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Progress</div>
                <div className="w-32 h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    className="h-full bg-black"
                  />
                </div>
              </div>
              <div className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full font-mono text-sm transition-all duration-500",
                timeLeft < 60 ? "bg-red-500 text-white animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.5)]" : "bg-zinc-100 text-zinc-600"
              )}>
                <Clock className={cn("w-4 h-4", timeLeft < 60 && "animate-spin-slow")} />
                {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'landing' && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="grid md:grid-cols-2 gap-12 items-center"
            >
              <div className="space-y-8">
                <div className="space-y-4">
                  <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black text-white text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-black/10"
                  >
                    <Zap className="w-3 h-3 text-yellow-400 animate-pulse" />
                    v2.0 Secure Protocol Active
                  </motion.div>
                  <h1 className="text-7xl font-bold tracking-tighter leading-[0.85]">
                    THE FUTURE OF <br />
                    <span className="text-zinc-300 italic">ASSESSMENT</span>
                  </h1>
                </div>
                <p className="text-zinc-500 text-xl leading-relaxed max-w-md">
                  A high-integrity platform for conducting online assessments with real-time monitoring and automated evaluation.
                </p>
                <div className="flex gap-4">
                  <Button onClick={() => setView('examiner')} className="px-8 py-4 text-lg">Examiner Portal</Button>
                  <Button variant="secondary" onClick={() => setView('student-reg')} className="px-8 py-4 text-lg">Student Portal</Button>
                </div>
              </div>
              <div className="relative">
                <motion.div 
                  animate={{ 
                    y: [0, -10, 0],
                  }}
                  transition={{ 
                    duration: 4, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                  className="aspect-square bg-zinc-100 rounded-[40px] overflow-hidden border border-black/5 flex items-center justify-center p-12"
                >
                  <div className="w-full h-full bg-white rounded-[32px] shadow-2xl border border-black/5 p-8 flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-12 h-12 rounded-2xl bg-zinc-100 flex items-center justify-center">
                          <BookOpen className="w-6 h-6 text-zinc-400" />
                        </div>
                        <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-600 text-[10px] font-bold uppercase tracking-widest">Live</div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-4 w-3/4 bg-zinc-100 rounded-full" />
                        <div className="h-4 w-1/2 bg-zinc-50 rounded-full" />
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="h-12 bg-zinc-100 rounded-xl" />
                        <div className="h-12 bg-black rounded-xl" />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-zinc-100" />
                        <div className="h-2 w-24 bg-zinc-100 rounded-full" />
                      </div>
                    </div>
                  </div>
                </motion.div>
                {/* Decorative elements */}
                <div className="absolute -top-6 -right-6 w-24 h-24 bg-emerald-400/10 rounded-full blur-3xl" />
                <div className="absolute -bottom-12 -left-12 w-48 h-48 bg-black/5 rounded-full blur-3xl" />
              </div>
            </motion.div>
          )}

          {view === 'examiner' && (
            <motion.div 
              key="examiner"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-4xl mx-auto space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold tracking-tight">Examiner Dashboard</h2>
                <p className="text-zinc-500">Configure your exam and upload source documents.</p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                <Card className="md:col-span-2 p-8 space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <Input label="Exam Title" value={examTitle} onChange={setExamTitle} placeholder="e.g. Midterm Physics" />
                    <Input label="Duration (Min)" type="number" value={examDuration} onChange={setExamDuration} />
                  </div>
                  <Input label="Examiner Email" type="email" value={examinerEmail} onChange={setExaminerEmail} placeholder="examiner@school.edu" />
                  
                  <div className="grid grid-cols-1 gap-6">
                    <FileUpload label="Question Paper (PDF)" onFileSelect={setQuestionFile} fileName={questionFile?.name} />
                  </div>

                  <div className="flex justify-between pt-4 border-t border-zinc-100">
                    <Button variant="ghost" onClick={() => setView('landing')}>Back</Button>
                    <Button disabled={isProcessing || isSaved} onClick={handleProcessPDFs} className="min-w-[160px]">
                      {isProcessing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><FileText className="w-4 h-4" /> Extract Data</>}
                    </Button>
                  </div>
                </Card>

                <div className="space-y-6">
                  <Card className="p-6 bg-zinc-900 text-white space-y-4">
                    <h3 className="font-bold flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Status
                    </h3>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">PDF Uploaded</span>
                        <span className={cn(questionFile ? "text-emerald-400" : "text-zinc-600")}>
                          {questionFile ? "Yes" : "No"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">Questions Extracted</span>
                        <span className={cn(extractedQuestions.length > 0 ? "text-emerald-400" : "text-zinc-600")}>
                          {extractedQuestions.length}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-400">AI Answer Detection</span>
                        <span className={cn(extractedKey ? "text-emerald-400" : "text-zinc-600")}>
                          {extractedKey ? "Success" : "Pending"}
                        </span>
                      </div>
                    </div>
                    {extractedQuestions.length > 0 && extractedKey && !isSaved && (
                      <Button onClick={handleSaveExam} className="w-full bg-white text-black hover:bg-zinc-200">
                        <Save className="w-4 h-4" />
                        Finalize & Save
                      </Button>
                    )}
                    {isSaved && (
                      <div className="text-center py-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs font-bold uppercase tracking-widest">
                        Exam Ready
                      </div>
                    )}
                  </Card>

                  {extractedQuestions.length > 0 && (
                    <Card className="p-6 space-y-4 max-h-[400px] overflow-y-auto">
                      <h3 className="font-bold text-sm">Preview Questions</h3>
                      <div className="space-y-4">
                        {extractedQuestions.map((q, i) => (
                          <div key={i} className="text-xs space-y-1">
                            <p className="font-bold text-zinc-400">Q{i+1}</p>
                            <p className="line-clamp-2">{q.text}</p>
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'student-reg' && (
            <motion.div 
              key="student-reg"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto space-y-8"
            >
              <div className="text-center space-y-2">
                <h2 className="text-4xl font-bold tracking-tight">Registration</h2>
                <p className="text-zinc-500">Enter your credentials to begin.</p>
              </div>

              <Card className="p-8 space-y-6">
                <Input label="Full Name" value={studentInfo.name} onChange={(v) => setStudentInfo(prev => ({ ...prev, name: v }))} placeholder="John Doe" />
                <Input label="Class / Grade" value={studentInfo.class} onChange={(v) => setStudentInfo(prev => ({ ...prev, class: v }))} placeholder="Grade 12A" />

                <div className="pt-4 space-y-4">
                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100 flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <div className="text-xs text-amber-800 leading-relaxed">
                      <strong>Security Protocol:</strong> This exam uses advanced monitoring. Switching tabs or exiting fullscreen will terminate your session.
                    </div>
                  </div>
                  <Button className="w-full py-4 text-lg" disabled={!studentInfo.name || !studentInfo.class || !exam} onClick={startExam}>
                    Begin Examination
                  </Button>
                  {!exam && <p className="text-center text-xs text-red-500">No exam has been set by the examiner yet.</p>}
                </div>
              </Card>
            </motion.div>
          )}

          {view === 'exam' && exam && (
            <motion.div 
              key="exam"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid md:grid-cols-4 gap-8"
            >
              {/* Question Navigator */}
              <div className="hidden md:block space-y-6">
                <Card className="p-6 space-y-6 sticky top-24">
                  <div className="space-y-2">
                    <h3 className="font-bold text-sm uppercase tracking-widest text-zinc-400">Questions</h3>
                    <div className="grid grid-cols-4 gap-2">
                      {exam.questions.map((q, i) => (
                        <button
                          key={q.id}
                          onClick={() => {
                            setCurrentQuestionIdx(i);
                            setShowReview(false);
                          }}
                          className={cn(
                            "w-full aspect-square rounded-lg text-xs font-bold transition-all",
                            currentQuestionIdx === i ? "bg-black text-white" : 
                            responses[q.id] !== undefined ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-400 hover:bg-zinc-200"
                          )}
                        >
                          {i + 1}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="pt-6 border-t border-zinc-100">
                    <Button variant="secondary" className="w-full text-xs" onClick={() => setShowReview(true)}>
                      Review All
                    </Button>
                  </div>
                </Card>
              </div>

              {/* Main Exam Area */}
              <div className="md:col-span-3 space-y-8">
                <AnimatePresence mode="wait">
                  {showReview ? (
                    <motion.div
                      key="review"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <h2 className="text-3xl font-bold tracking-tight">Review Your Answers</h2>
                        <Button variant="ghost" onClick={() => setShowReview(false)}>Back to Questions</Button>
                      </div>
                      <div className="space-y-4">
                        {exam.questions.map((q, i) => (
                          <Card key={q.id} className="p-6 flex items-center justify-between" onClick={() => {
                            setCurrentQuestionIdx(i);
                            setShowReview(false);
                          }}>
                            <div className="flex items-center gap-4">
                              <span className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold">{i + 1}</span>
                              <p className="text-sm font-medium line-clamp-1">{q.text}</p>
                            </div>
                            <div className={cn(
                              "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                              responses[q.id] !== undefined ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                            )}>
                              {responses[q.id] !== undefined ? "Answered" : "Unanswered"}
                            </div>
                          </Card>
                        ))}
                      </div>
                      <div className="pt-8 flex justify-center">
                        <Button className="px-12 py-4 text-lg" onClick={() => submitExam()}>
                          Submit Final Responses
                          <Send className="w-5 h-5" />
                        </Button>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key={currentQuestionIdx}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-8"
                    >
                      <div className="space-y-6">
                        <div className="flex items-center gap-4">
                          <span className="flex items-center justify-center w-12 h-12 rounded-2xl bg-black text-white text-lg font-bold">
                            {currentQuestionIdx + 1}
                          </span>
                          <h3 className="text-3xl font-bold tracking-tight leading-tight">
                            {exam.questions[currentQuestionIdx].text}
                          </h3>
                        </div>
                        <div className="grid gap-4">
                          {exam.questions[currentQuestionIdx].options.map((opt, optIdx) => (
                            <motion.button
                              key={optIdx}
                              whileHover={{ x: 8, scale: 1.01 }}
                              whileTap={{ scale: 0.98 }}
                              onClick={() => setResponses(prev => ({ ...prev, [exam.questions[currentQuestionIdx].id]: optIdx }))}
                              className={cn(
                                "text-left px-8 py-6 rounded-[24px] border-2 transition-all flex items-center justify-between group relative overflow-hidden",
                                responses[exam.questions[currentQuestionIdx].id] === optIdx 
                                  ? "bg-black text-white border-black shadow-xl" 
                                  : "bg-white border-zinc-100 hover:border-zinc-300 hover:shadow-md"
                              )}
                            >
                              <div className="flex items-center gap-4 z-10">
                                <span className={cn(
                                  "w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
                                  responses[exam.questions[currentQuestionIdx].id] === optIdx 
                                    ? "bg-white/20 text-white" 
                                    : "bg-zinc-100 text-zinc-400 group-hover:bg-zinc-200"
                                )}>
                                  {String.fromCharCode(65 + optIdx)}
                                </span>
                                <span className="text-lg font-medium">{opt}</span>
                              </div>
                              
                              <div className={cn(
                                "w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all z-10",
                                responses[exam.questions[currentQuestionIdx].id] === optIdx 
                                  ? "border-white bg-white" 
                                  : "border-zinc-200 group-hover:border-zinc-400"
                                )}>
                                {responses[exam.questions[currentQuestionIdx].id] === optIdx && (
                                  <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-2.5 h-2.5 rounded-full bg-black" 
                                  />
                                )}
                              </div>

                              {responses[exam.questions[currentQuestionIdx].id] === optIdx && (
                                <motion.div
                                  layoutId="option-bg"
                                  className="absolute inset-0 bg-black -z-0"
                                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                              )}
                            </motion.button>
                          ))}
                        </div>
                      </div>

                      <div className="pt-12 flex items-center justify-between">
                        <Button 
                          variant="ghost" 
                          disabled={currentQuestionIdx === 0}
                          onClick={() => setCurrentQuestionIdx(prev => prev - 1)}
                        >
                          <ChevronLeft className="w-5 h-5" />
                          Previous
                        </Button>
                        <div className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                          Question {currentQuestionIdx + 1} of {exam.questions.length}
                        </div>
                        {currentQuestionIdx === exam.questions.length - 1 ? (
                          <Button onClick={() => setShowReview(true)}>
                            Review & Submit
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                        ) : (
                          <Button onClick={() => setCurrentQuestionIdx(prev => prev + 1)}>
                            Next Question
                            <ChevronRight className="w-5 h-5" />
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {view === 'result' && finalResult && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-xl mx-auto space-y-8"
            >
              <Card className="p-12 space-y-12 text-center relative overflow-hidden">
                {/* Background decoration */}
                <div className="absolute top-0 left-0 w-full h-2 bg-black" />
                
                <div className="space-y-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", damping: 12 }}
                    className="w-24 h-24 rounded-full flex items-center justify-center mx-auto shadow-xl bg-emerald-100 text-emerald-600"
                  >
                    <CheckCircle2 className="w-12 h-12" />
                  </motion.div>
                  <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tight">Examination successfully completed</h2>
                    <p className="text-zinc-500 max-w-xs mx-auto">Your responses have been securely transmitted and evaluated.</p>
                  </div>
                </div>

                <div className="pt-8 border-t border-zinc-100">
                  <Button className="w-full py-4 text-lg" onClick={() => window.location.reload()}>
                    Return to Home
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-black/5">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2 font-bold text-sm tracking-tight opacity-40">
            <Shield className="w-4 h-4" />
            <span>SECURE EXAM PROTOCOL</span>
          </div>
          <div className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">
            &copy; 2024 High Integrity Assessment Platform
          </div>
        </div>
      </footer>
    </div>
  );
}

