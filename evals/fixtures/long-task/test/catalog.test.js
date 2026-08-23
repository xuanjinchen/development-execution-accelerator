import { defineCatalogContract } from '../../contracts/catalog-contract.js';
import { normalizeCatalog } from '../src/catalog/normalize-catalog.js';

defineCatalogContract(normalizeCatalog);
