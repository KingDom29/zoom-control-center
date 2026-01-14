const isDev = import.meta.env.DEV;

const noop = () => {};

const bindConsoleMethod = (method) => {
  const c = globalThis['console'];
  if (!c) return noop;

  const fn = c[method];
  if (typeof fn !== 'function') return noop;

  return fn.bind(c);
};

const createLoggerFn = (method) => (isDev ? bindConsoleMethod(method) : noop);

const logger = {
  debug: createLoggerFn('debug'),
  info: createLoggerFn('info'),
  warn: createLoggerFn('warn'),
  error: createLoggerFn('error')
};

export default logger;
