import React from 'react';
import {Composition} from 'remotion';
import {ManiReel, FPS, SRC_FRAMES, NOHOOK_START} from './ManiReel';
import {HandReel, Job, reelFrames} from './HandReel';
import rafiFlush from '../jobs/rafi-flush.json';
import rafiAq from '../jobs/rafi-aq.json';

const reel = (id: string, job: Job) => {
  return (
    <React.Fragment key={id}>
      <Composition
        id={`${id}-hook`}
        component={HandReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={reelFrames(job, true)}
        defaultProps={{job, withHook: true}}
      />
      <Composition
        id={`${id}-nohook`}
        component={HandReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={reelFrames(job, false)}
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
    {reel('RafiAQ', rafiAq as unknown as Job)}
  </>
);
