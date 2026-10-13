import React from 'react';
import {Composition} from 'remotion';
import {ManiReel, FPS, SRC_FRAMES, NOHOOK_START} from './ManiReel';
import {ColdOpenReel, DoubleReel, HandReel, Job, coldOpenFrames, doubleFrames, reelFrames} from './HandReel';
import rafiFlush from '../jobs/rafi-flush.json';
import rafiAq from '../jobs/rafi-aq.json';
import wsopFull from '../jobs/rafi-wsop-fullhouse.json';
import wsopQueens from '../jobs/rafi-wsop-queens.json';
import maniRit2 from '../jobs/mani-run-it-twice.json';
import isra94 from '../jobs/isra9-4.json';
import isra94hand from '../jobs/isra9-4-hand.json';
import isra94caps from '../jobs/isra9-4-caps.json';
import isra94handcaps from '../jobs/isra9-4-hand-caps.json';

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
      <Composition
        id={`${id}-noend`}
        component={HandReel}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={reelFrames(job, false, false)}
        defaultProps={{job, withHook: false, showEnd: false}}
      />
    </React.Fragment>
  );
};

const cold = (id: string, job: Job & {teaser?: [number, number]}) =>
  job.teaser ? (
    <Composition
      key={id + '-cold'}
      id={`${id}-cold`}
      component={ColdOpenReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={coldOpenFrames(job, job.teaser[0], job.teaser[1])}
      defaultProps={{job, teaser: job.teaser}}
    />
  ) : null;

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
    {reel('WsopFullHouse', wsopFull as unknown as Job)}
    {reel('WsopQueens', wsopQueens as unknown as Job)}
    {reel('ManiRunItTwice', maniRit2 as unknown as Job)}
    {reel('Isra94', isra94 as unknown as Job)}
    {reel('Isra94Hand', isra94hand as unknown as Job)}
    {reel('Isra94Caps', isra94caps as unknown as Job)}
    {reel('Isra94HandCaps', isra94handcaps as unknown as Job)}
    {cold('WsopFullHouse', wsopFull as unknown as Job)}
    {cold('WsopQueens', wsopQueens as unknown as Job)}
    <Composition
      id="RafiDouble"
      component={DoubleReel}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={doubleFrames(rafiFlush as unknown as Job, rafiAq as unknown as Job, true)}
      defaultProps={{first: rafiFlush as unknown as Job, second: rafiAq as unknown as Job, withHook: true, bridge: 'והיד הבאה...'}}
    />
  </>
);
