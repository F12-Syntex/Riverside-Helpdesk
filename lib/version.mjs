// Which build is this?
//
// The question the badge in the corner answers is not "what release is this" —
// there are no releases, there is one deployment and everybody is on it. It is
// "is the thing in front of me the thing that was just deployed?", asked by
// somebody at the desk who has been told a change is live and cannot see it.
//
// TWO HALVES, BECAUSE THEY ANSWER DIFFERENT QUESTIONS AND ONE OF THEM LIES.
//
//   `version` is package.json's. It is typed by a person, so it means whatever
//   somebody remembered to type. It has read 1.0.0 since the first commit.
//
//   `build` is the commit, injected by the host at build time. Nobody maintains
//   it and it cannot drift, so it is the half that actually identifies a
//   deployment. Empty when built outside the host, which is honest — an unknown
//   build says nothing rather than claiming to be a known one.
import pkg from '../package.json';

export const VERSION = String(pkg.version || '0.0.0');

// Vercel exposes the commit to the build. Read once, at module scope, so it is
// baked into the bundle rather than looked up per render.
export const BUILD = String(process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7);

// What the corner shows. The version alone; the commit rides in the tooltip
// where it costs nothing to carry and is there when somebody needs to say
// exactly which build they were looking at.
export const VERSION_LABEL = 'v' + VERSION;
export const BUILD_LABEL = BUILD ? VERSION_LABEL + ' · ' + BUILD : VERSION_LABEL;
