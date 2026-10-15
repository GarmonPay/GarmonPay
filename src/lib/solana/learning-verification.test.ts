import {describe,it,expect} from 'vitest';
import {evaluateLessonAttempt,type LessonDefinition} from './learning-verification';
const lesson:LessonDefinition={id:'wallet_safety',version:'v1',requiredSeconds:30,passingBps:10000,questions:[{id:'secret',choices:['seed','address'],correctChoice:'seed'}]};
const attempt={lessonId:lesson.id,lessonVersion:'v1',startedAt:100000,now:130000,videoVerifiedSeconds:30,answers:{secret:'seed'},riskApproved:true};
describe('Server lesson verification',()=>{
 it('verifies completion without manufacturing a funded reward',()=>expect(evaluateLessonAttempt(lesson,attempt)).toMatchObject({passed:true,completionEligible:true,rewardEnabled:false}));
 it('records a failed quiz without completion',()=>expect(evaluateLessonAttempt(lesson,{...attempt,answers:{secret:'address'}}).passed).toBe(false));
 it.each([{lessonVersion:'v0'},{videoVerifiedSeconds:29},{videoVerifiedSeconds:31},{now:129999},{riskApproved:false},{answers:{}},{answers:{secret:'seed',extra:'seed'}}])('rejects invalid participation %j',change=>expect(()=>evaluateLessonAttempt(lesson,{...attempt,...change} as Parameters<typeof evaluateLessonAttempt>[1])).toThrow());
 it('rejects broken answer keys and duplicate questions',()=>{
  expect(()=>evaluateLessonAttempt({...lesson,questions:[...lesson.questions,...lesson.questions]},attempt)).toThrow();
  expect(()=>evaluateLessonAttempt({...lesson,questions:[{...lesson.questions[0],correctChoice:'fake'}]},attempt)).toThrow();
 });
});
