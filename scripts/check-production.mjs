import {
  monitorConfiguration,
  ProductionCheckError,
  runProductionMonitor,
} from './lib/production-monitor.mjs';

try {
  const result = await runProductionMonitor(monitorConfiguration(process.env));
  console.log(JSON.stringify({ event: 'production_monitor', ...result }));
} catch (error) {
  console.error(
    JSON.stringify({
      event: 'production_monitor',
      status: 'unavailable',
      check: error instanceof ProductionCheckError ? error.code : 'monitor_failed',
    }),
  );
  process.exitCode = 1;
}
