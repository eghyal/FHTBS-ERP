import { masterDataRepository } from "../repositories/masterDataRepository.ts";
import { cacheService } from "./cacheService.ts";

export class MasterDataService {
  getCustomers() {
    return masterDataRepository.getCustomers();
  }

  createCustomer(data: any, userEmail: string) {
    return masterDataRepository.createCustomer(data, userEmail);
  }

  getSuppliers() {
    return masterDataRepository.getSuppliers();
  }

  createSupplier(data: any, userEmail: string) {
    return masterDataRepository.createSupplier(data, userEmail);
  }

  clearAllCache() {
    cacheService.clear();
    return { success: true, message: "All in-memory master data caches cleared." };
  }

  getCacheStats() {
    return cacheService.getStats();
  }
}

export const masterDataService = new MasterDataService();
