import {Config} from '@remotion/cli/config';
import {existsSync} from 'node:fs';

// Use the Chromium that ships with this machine when it exists, so nothing is downloaded.
const local = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
if (existsSync(local)) {
  Config.setBrowserExecutable(local);
}
Config.setVideoImageFormat('jpeg');
Config.setConcurrency(4);
