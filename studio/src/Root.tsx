import React from 'react';
import {Composition} from 'remotion';
import {ManiReel, FPS, SRC_DURATION, NOHOOK_START} from './ManiReel';

export const Root: React.FC = () => (
  <>
    <Composition
      id="ManiWithHook"
      component={ManiReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.round(SRC_DURATION * FPS)}
      defaultProps={{withHook: true}}
    />
    <Composition
      id="ManiNoHook"
      component={ManiReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={Math.round((SRC_DURATION - NOHOOK_START) * FPS)}
      defaultProps={{withHook: false}}
    />
  </>
);
