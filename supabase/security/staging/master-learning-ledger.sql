-- LOCAL ONLY. Server-approved lessons/completions; rewards use campaign reserves.
BEGIN;
CREATE TABLE public.gp_sol_lessons (
 lesson_id text NOT NULL, version text NOT NULL, required_seconds integer NOT NULL CHECK(required_seconds BETWEEN 0 AND 14400),
 question_count integer NOT NULL CHECK(question_count BETWEEN 1 AND 100), passing_bps integer NOT NULL CHECK(passing_bps BETWEEN 1 AND 10000),
 approved boolean NOT NULL DEFAULT false, PRIMARY KEY(lesson_id,version)
);
CREATE TABLE public.gp_sol_learning_completions (
 proof_id uuid PRIMARY KEY REFERENCES public.gp_sol_view_proofs,
 lesson_id text NOT NULL, lesson_version text NOT NULL, viewer_wallet text NOT NULL REFERENCES public.gp_sol_identities,
 correct_answers integer NOT NULL CHECK(correct_answers>=0), video_verified_seconds integer NOT NULL CHECK(video_verified_seconds>=0),
 verifier_reference text UNIQUE NOT NULL, verified_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(lesson_id,lesson_version) REFERENCES public.gp_sol_lessons,
 UNIQUE(viewer_wallet,lesson_id,lesson_version)
);
CREATE TRIGGER gp_sol_lessons_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_lessons FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE TRIGGER gp_sol_learning_immutable BEFORE UPDATE OR DELETE ON public.gp_sol_learning_completions FOR EACH ROW EXECUTE FUNCTION public.gp_sol_immutable();
CREATE FUNCTION public.gp_sol_require_learning_completion() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE completion public.gp_sol_learning_completions; lesson public.gp_sol_lessons; proof public.gp_sol_view_proofs;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.gp_sol_campaigns WHERE id=NEW.campaign_id AND package='learn') THEN RETURN NEW; END IF;
 SELECT * INTO completion FROM public.gp_sol_learning_completions WHERE proof_id=NEW.proof_id AND viewer_wallet=NEW.viewer_wallet;
 IF NOT FOUND THEN RAISE EXCEPTION 'Verified lesson completion required'; END IF;
 SELECT * INTO lesson FROM public.gp_sol_lessons WHERE lesson_id=completion.lesson_id AND version=completion.lesson_version;
 SELECT * INTO proof FROM public.gp_sol_view_proofs WHERE id=NEW.proof_id;
 IF NOT lesson.approved OR completion.correct_answers>lesson.question_count OR completion.correct_answers*10000<lesson.passing_bps*lesson.question_count OR completion.video_verified_seconds<lesson.required_seconds OR completion.verified_at>now() OR completion.verified_at<proof.started_at+make_interval(secs=>lesson.required_seconds) OR completion.verified_at>proof.expires_at OR completion.video_verified_seconds>extract(epoch FROM completion.verified_at-proof.started_at) THEN RAISE EXCEPTION 'Lesson verification eligibility failed'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER gp_sol_learning_reward_gate BEFORE INSERT ON public.gp_sol_view_awards FOR EACH ROW EXECUTE FUNCTION public.gp_sol_require_learning_completion();
ALTER TABLE public.gp_sol_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gp_sol_learning_completions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gp_sol_lessons,public.gp_sol_learning_completions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT ON public.gp_sol_lessons,public.gp_sol_learning_completions TO service_role;
REVOKE ALL ON FUNCTION public.gp_sol_require_learning_completion() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.gp_sol_require_learning_completion() TO service_role;
COMMIT;
