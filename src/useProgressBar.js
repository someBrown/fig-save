import cliProgress from 'cli-progress';

export const useProgressBar = () => {
  const progressBar = new cliProgress.SingleBar({
    format: ' {bar} | {percentage}% | {value}/{total}',
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    stopOnComplete: true,
    clearOnComplete: true,
  });

  return { progressBar };
};
