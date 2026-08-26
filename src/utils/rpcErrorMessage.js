/**
 * Extract a human-readable message from an RPC rejection.
 *
 * @neuraiproject/neurai-rpc >= 0.5 never rejects with a plain Error, so
 * `error.message` is undefined for every node failure. It uses three shapes:
 *
 *   1. {error: {code, message}, description}      JSON-RPC error (also on HTTP 200)
 *   2. {statusText, status, description, error}   HTTP response other than 200
 *   3. {originalError, type: 'ServerUnreachable', error, description}
 *
 * In shape 3 `error` is a string, in shapes 1 and 2 it is an object (or
 * null). Plain Errors (thrown by this library or by mocks) keep working
 * through the `error.message` candidate.
 */
function rpcErrorMessage(error) {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }

  const candidates = [
    error.error && error.error.message,
    typeof error.error === 'string' ? error.error : null,
    error.description,
    error.message,
    error.statusText
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return '';
}

module.exports = { rpcErrorMessage };
