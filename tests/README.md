# Tests para @neuraiproject/neurai-assets

Esta carpeta contiene la suite completa de tests para la librería de gestión de activos de Neurai.

## Estructura de Tests

```
tests/
├── mocks/              # Mocks para RPC y dependencias
│   └── rpcMock.js     # Mock del RPC de Neurai
├── unit/              # Tests unitarios
│   ├── validators/    # Tests para validadores
│   ├── utils/         # Tests para utilidades
│   └── NeuraiAssets.test.js  # Tests de la clase principal
└── integration/       # Tests de integración
    └── assetLifecycle.test.js  # Tests del ciclo de vida completo
```

## Ejecutar Tests

### Todos los tests
```bash
npm test
```

### Solo tests unitarios
```bash
npm run test:unit
```

### Solo tests de integración
```bash
npm run test:integration
```

### Tests en modo watch (re-ejecuta al guardar cambios)
```bash
npm run test:watch
```

## Cobertura de Tests

### Validators (Validadores)
- **assetNameValidator.test.js**: Valida nombres de activos ROOT, SUB, UNIQUE, QUALIFIER, RESTRICTED y OWNER
- **amountValidator.test.js**: Valida cantidades, unidades y rangos de activos

### Utils (Utilidades)
- **assetNameParser.test.js**: Prueba el parsing y detección de tipos de activos
- **amountConverter.test.js**: Prueba conversiones entre cantidades y satoshis

### Clase Principal
- **NeuraiAssets.test.js**: Prueba la clase principal y sus métodos

### Integración
- **assetLifecycle.test.js**: Prueba workflows completos de creación y gestión de activos

## Tests Actuales

Total: **124 tests pasando**

### Desglose por módulo:
- AmountConverter: 24 tests
- AssetNameParser: 29 tests
- AmountValidator: 21 tests
- AssetNameValidator: 33 tests
- NeuraiAssets: 10 tests
- Integration Tests: 7 tests

## Mocks Disponibles

### RPCMock
Mock flexible del RPC de Neurai que permite:
- Configurar respuestas personalizadas para métodos específicos
- Rastrear llamadas realizadas
- Simular errores y casos edge

```javascript
const { createMockRPC, createMockUTXO, createMockAssetData } = require('./mocks/rpcMock');

// Crear mock con respuestas personalizadas
const mockRPC = createMockRPC({
  'getassetdata': { name: 'MYTOKEN', amount: 1000000 }
});

// Usar en tests
const assets = new NeuraiAssets(mockRPC);
```

## Agregar Nuevos Tests

Para agregar nuevos tests:

1. **Tests unitarios**: Coloca el archivo en `tests/unit/[modulo]/`
2. **Tests de integración**: Coloca el archivo en `tests/integration/`
3. **Nombra el archivo**: `*.test.js` para que Mocha lo detecte automáticamente
4. **Usa la estructura estándar**:

```javascript
const { expect } = require('chai');

describe('NombreDelModulo', () => {
  describe('nombreDelMetodo', () => {
    it('debería hacer algo específico', () => {
      // Arrange
      const input = 'valor';

      // Act
      const result = someFunction(input);

      // Assert
      expect(result).to.equal('esperado');
    });
  });
});
```

## Frameworks Utilizados

- **Mocha**: Framework de testing
- **Chai**: Librería de assertions (expect)

## Notas

- Los tests no requieren conexión a un nodo Neurai real
- Todos los tests usan mocks para simular llamadas RPC
- Los tests verifican tanto casos exitosos como errores esperados
