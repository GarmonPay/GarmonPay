/** Trusted server catalog + persisted attempts only; never browser answer keys. */
export type LessonDefinition = {
  id: string; version: string; requiredSeconds: number; passingBps: number;
  questions: {id: string; choices: string[]; correctChoice: string}[];
};
export function evaluateLessonAttempt(lesson: LessonDefinition, attempt: {
  lessonId: string; lessonVersion: string; startedAt: number; now: number;
  videoVerifiedSeconds: number; answers: Record<string,string>; riskApproved: boolean;
}) {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(lesson.id) || !/^[A-Za-z0-9_-]{1,100}$/.test(lesson.version) ||
    !Number.isSafeInteger(lesson.requiredSeconds) || lesson.requiredSeconds<0 || lesson.requiredSeconds>14400 ||
    !Number.isSafeInteger(lesson.passingBps) || lesson.passingBps<1 || lesson.passingBps>10000 ||
    !lesson.questions.length || lesson.questions.length>100 || new Set(lesson.questions.map(q=>q.id)).size!==lesson.questions.length ||
    lesson.questions.some(q=>!q.id || q.choices.length<2 || new Set(q.choices).size!==q.choices.length || !q.choices.includes(q.correctChoice))) throw new Error('Invalid approved lesson definition');
  if (attempt.lessonId!==lesson.id || attempt.lessonVersion!==lesson.version) throw new Error('Lesson version mismatch');
  if (![attempt.startedAt,attempt.now,attempt.videoVerifiedSeconds].every(Number.isSafeInteger) || attempt.now<attempt.startedAt ||
    attempt.now-attempt.startedAt<lesson.requiredSeconds*1000 || attempt.videoVerifiedSeconds<lesson.requiredSeconds ||
    attempt.videoVerifiedSeconds*1000>attempt.now-attempt.startedAt || !attempt.riskApproved) throw new Error('Server-verified participation required');
  if(Object.keys(attempt.answers).length!==lesson.questions.length || lesson.questions.some(q=>!Object.hasOwn(attempt.answers,q.id) || !q.choices.includes(attempt.answers[q.id]))) throw new Error('Complete valid quiz answers required');
  const correct=lesson.questions.filter(q=>attempt.answers[q.id]===q.correctChoice).length;
  const passed=correct*10000>=lesson.passingBps*lesson.questions.length;
  return {lessonId:lesson.id,lessonVersion:lesson.version,correct,total:lesson.questions.length,passed,
    completionEligible:passed,rewardEnabled:false as const,requiresAtomicCompletion:true as const};
}
