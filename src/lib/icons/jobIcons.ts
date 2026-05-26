export type JobKey = 'CRP' | 'BSM' | 'ARM' | 'GSM' | 'LTW' | 'WVR' | 'ALC' | 'CUL' | 'MIN' | 'BTN' | 'FSH';

interface JobIconEntry {
  file: string;
  alt: string;
}

export const JOB_ICONS: Readonly<Record<JobKey, JobIconEntry>> = {
  CRP: { file: '/icons/jobs/CRP.png', alt: 'Carpenter' },
  BSM: { file: '/icons/jobs/BSM.png', alt: 'Blacksmith' },
  ARM: { file: '/icons/jobs/ARM.png', alt: 'Armorer' },
  GSM: { file: '/icons/jobs/GSM.png', alt: 'Goldsmith' },
  LTW: { file: '/icons/jobs/LTW.png', alt: 'Leatherworker' },
  WVR: { file: '/icons/jobs/WVR.png', alt: 'Weaver' },
  ALC: { file: '/icons/jobs/ALC.png', alt: 'Alchemist' },
  CUL: { file: '/icons/jobs/CUL.png', alt: 'Culinarian' },
  MIN: { file: '/icons/jobs/MIN.png', alt: 'Miner' },
  BTN: { file: '/icons/jobs/BTN.png', alt: 'Botanist' },
  FSH: { file: '/icons/jobs/FSH.png', alt: 'Fisher' },
};

export function isJobKey(s: string): s is JobKey {
  return s in JOB_ICONS;
}
