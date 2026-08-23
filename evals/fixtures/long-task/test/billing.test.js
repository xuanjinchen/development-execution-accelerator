import { defineBillingContract } from '../../contracts/billing-contract.js';
import { allocateInvoice } from '../src/billing/allocate-invoice.js';

defineBillingContract(allocateInvoice);
