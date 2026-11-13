import handle from '../server/suite.mjs';

export default {
  fetch(request) {
    const { pathname, searchParams } = new URL(request.url);
    const file = pathname.startsWith('/api/suite/') ? pathname.split('/').at(-1) : searchParams.get('file');
    return handle({ request, params: { file }, fixedEntry: true });
  },
};
