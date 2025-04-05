// Export tất cả các services
export * from './mikrotik';
export * from './wireless';
export * from './capsman';
export * from './device_info';
export * from './discovery';
export * from './device-identification';
export * from './device-classifier';
export * from './traffic-collector';
export * from './scheduler';
export * from './dhcp';
export * from './network-scanner';

// Import từ client-management service
import clientManagementService from './client-management';

// Alias exports
import * as deviceIdentificationService from './device-identification';
import * as deviceClassifierService from './device-classifier';
import * as trafficCollectorService from './traffic-collector';
import * as discoveryService from './discovery';

export {
  clientManagementService,
  deviceIdentificationService,
  deviceClassifierService,
  trafficCollectorService,
  discoveryService
};