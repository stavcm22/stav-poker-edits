import React from 'react';
import {Composition} from 'remotion';
import {ManiReel, FPS, SRC_FRAMES, NOHOOK_START} from './ManiReel';
import {HandReel, HOOK_SEC, Job, outDuration} from './HandReel';
import rafiFlush from '../jobs/rafi-flush.json';

const reel = (id: string, job: Job) => {
  const content = Math.round(outDuration(job) * FPS);
  return (
    <React.Fragment key={id}>
      <Composition
        id={`${id}-hook`}
        component={HandReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={content + (job.hook ? Math.round(HOOK_SEC * FPS) : 0)}
        defaultProps={{job, withHook: true}}
      />
      <Composition
        id={`${id}-nohook`}
        component={HandReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={content}
        defaultProps={{job, withHook: false}}
      />
    </React.Fragment>
  );
};

export const Root: React.FC = () => (
  <>
    <Composition
      id="ManiWithHook"
      component={ManiReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={SRC_FRAMES}
      defaultProps={{withHook: true}}
    />
    <Composition
      id="ManiNoHook"
      component={ManiReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={SRC_FRAMES - Math.round(NOHOOK_START * FPS)}
      defaultProps={{withHook: false}}
    />
    {reel('RafiFlush', rafiFlush as unknown as Job)}
  </>
);
