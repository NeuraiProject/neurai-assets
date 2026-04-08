# Tests for `@neuraiproject/neurai-assets`

This folder contains the test suite for the Neurai asset management library.

## Test Structure

```text
tests/
├── mocks/                    # RPC and dependency mocks
│   └── rpcMock.js            # Neurai RPC mock
├── unit/                     # Unit tests
│   ├── builders/             # Build-result and compatibility tests
│   ├── validators/           # Validator tests
│   ├── utils/                # Utility tests
│   └── NeuraiAssets.test.js  # Main class tests
├── integration/              # Integration tests
│   └── assetLifecycle.test.js
└── browser/                  # Browser bundle tests
    └── globalBundle.test.js
```

## Running Tests

### All tests

```bash
npm test
```

### Unit tests only

```bash
npm run test:unit
```

### Integration tests only

```bash
npm run test:integration
```

### Browser tests only

```bash
npm run test:browser
```

### Watch mode

```bash
npm run test:watch
```

## Test Coverage

### Validators

- `assetNameValidator.test.js`: validates ROOT, SUB, UNIQUE, QUALIFIER, RESTRICTED, DEPIN, and OWNER asset names
- `amountValidator.test.js`: validates asset quantities, units, and ranges

### Utils

- `assetNameParser.test.js`: covers parsing and asset-type detection
- `amountConverter.test.js`: covers conversions between logical amounts and satoshis
- `networkDetector.test.js`: covers network detection and burn-address mapping

### Builders

- `buildResultMetadata.test.js`: verifies explicit build metadata such as burn and change outputs
- `localRawBuildCompatibility.test.js`: verifies compatibility with `@neuraiproject/neurai-create-transaction`

### Main Class

- `NeuraiAssets.test.js`: covers the main class and its public methods

### Integration

- `assetLifecycle.test.js`: covers end-to-end asset lifecycle workflows

### Browser

- `globalBundle.test.js`: verifies the browser/global bundle entry points

## Available Mocks

### `RPCMock`

Flexible Neurai RPC mock that supports:

- custom responses for specific RPC methods
- call-history tracking
- error and edge-case simulation

```javascript
const { createMockRPC, createMockUTXO, createMockAssetData } = require('./mocks/rpcMock');

const mockRPC = createMockRPC({
  getassetdata: { name: 'MYTOKEN', amount: 1000000 }
});

const assets = new NeuraiAssets(mockRPC);
```

## Adding New Tests

1. Put unit tests in `tests/unit/`.
2. Put integration tests in `tests/integration/`.
3. Put browser-specific tests in `tests/browser/` when needed.
4. Use the `*.test.js` naming pattern so Mocha picks them up automatically.
5. Follow the standard structure:

```javascript
const { expect } = require('chai');

describe('ModuleName', () => {
  describe('methodName', () => {
    it('should do something specific', () => {
      const input = 'value';
      const result = someFunction(input);
      expect(result).to.equal('expected');
    });
  });
});
```

## Testing Stack

- `Mocha`: test runner
- `Chai`: assertions

## Notes

- Tests do not require a live Neurai node.
- RPC interactions are mocked.
- The suite covers both successful flows and expected failures.
