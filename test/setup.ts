import 'dotenv/config';

const url = process.env.TEST_DATABASE_URL;
if (!url || !/^postgres(ql)?:\/\//.test(url)) {
  throw new Error(
    'Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test',
  );
}
if (!decodeURIComponent(new URL(url).pathname).endsWith('_test')) {
  throw new Error(
    'Refusing to reset a database whose name does not end in _test',
  );
}
if (
  process.env.DATABASE_URL &&
  new URL(process.env.DATABASE_URL).pathname === new URL(url).pathname
) {
  throw new Error(
    'TEST_DATABASE_URL must use a different database name from DATABASE_URL',
  );
}
process.env.DATABASE_URL = url;
