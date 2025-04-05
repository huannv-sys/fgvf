import express, { type Request, Response, NextFunction } from "express";
import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { storage } from "./storage";
import { 
  mikrotikService, 
  wirelessService, 
  capsmanService, 
  schedulerService, 
  deviceInfoService,
  trafficCollectorService,
  networkScannerService,
  clientManagementService
} from "./services";
import * as discoveryService from "./services/discovery";
import * as deviceIdentificationService from "./services/device-identification";
import * as deviceClassifierService from "./services/device-classifier";
import { interfaceHealthService } from "./services/interface_health";
import { 
  insertDeviceSchema, 
  insertAlertSchema,
  insertNetworkDeviceSchema,
  networkDevices
} from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  const router = express.Router();

  // Start the scheduler service once the server starts
  schedulerService.initialize();

  // Device routes
  router.get("/devices", async (req: Request, res: Response) => {
    try {
      const devices = await storage.getAllDevices();
      
      // Kiểm tra trạng thái online của các thiết bị nếu có param check=true
      if (req.query.check === 'true') {
        console.log('Đang kiểm tra trạng thái online của các thiết bị...');
        for (const device of devices) {
          if (device.ipAddress) {
            // Kiểm tra trạng thái online
            const isOnline = await mikrotikService.checkDeviceOnline(device.ipAddress);
            
            // Nếu trạng thái khác với DB, cập nhật DB
            if (device.isOnline !== isOnline) {
              console.log(`Trạng thái thiết bị ${device.name} (${device.ipAddress}) đã thay đổi: ${device.isOnline} -> ${isOnline}`);
              await storage.updateDevice(device.id, { 
                isOnline,
                lastSeen: isOnline ? new Date() : device.lastSeen
              });
              // Cập nhật đối tượng thiết bị để trả về cho client
              device.isOnline = isOnline;
            }
          }
        }
      }
      
      res.json(devices);
    } catch (error) {
      console.error('Lỗi khi lấy danh sách thiết bị:', error);
      res.status(500).json({ message: "Failed to fetch devices" });
    }
  });

  router.get("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      res.json(device);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch device" });
    }
  });

  router.post("/devices", async (req: Request, res: Response) => {
    try {
      const validatedData = insertDeviceSchema.parse(req.body);
      const device = await storage.createDevice(validatedData);
      res.status(201).json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create device" });
    }
  });

  router.put("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const existingDevice = await storage.getDevice(deviceId);
      
      if (!existingDevice) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      // Tạo một schema mở rộng để cho phép cập nhật thêm các trường
      const updateDeviceSchema = insertDeviceSchema.partial().extend({
        hasCAPsMAN: z.boolean().optional(),
        hasWireless: z.boolean().optional(),
        isOnline: z.boolean().optional(),
        uptime: z.string().optional(),
        lastSeen: z.date().optional(), // Chỉ cho phép Date object
      });
      
      const validatedData = updateDeviceSchema.parse(req.body);
      console.log("Updating device with data:", validatedData);
      
      const updatedDevice = await storage.updateDevice(deviceId, validatedData);
      res.json(updatedDevice);
    } catch (error) {
      console.error("Error updating device:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update device" });
    }
  });

  router.delete("/devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const success = await storage.deleteDevice(deviceId);
      
      if (!success) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete device" });
    }
  });

  // Metrics routes
  router.get("/devices/:id/metrics", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const metrics = await storage.getMetrics(deviceId, limit);
      
      // Trả về metrics thực tế từ cơ sở dữ liệu - không sử dụng dữ liệu mẫu
      res.json(metrics || []);
    } catch (error) {
      console.error("Lỗi khi lấy metrics:", error);
      res.status(500).json({ message: "Failed to fetch metrics" });
    }
  });

  // Get device logs
  router.get("/devices/:id/logs", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      
      // Xác thực và kiểm tra thiết bị
      const device = await storage.getDevice(deviceId);
      if (!device) {
        return res.status(404).json({ 
          success: false, 
          message: "Không tìm thấy thiết bị" 
        });
      }
      
      // Xử lý các tham số truy vấn để lọc logs
      const options: {
        topics?: string[];
        limit?: number;
        timeFrom?: string;
        timeTo?: string;
        dateFrom?: string;
        dateTo?: string;
      } = {};
      
      // Xử lý limit (giới hạn số lượng bản ghi)
      if (req.query.limit) {
        options.limit = parseInt(req.query.limit as string);
      } else {
        options.limit = 100; // Giới hạn mặc định
      }
      
      // Xử lý topics (chủ đề logs)
      if (req.query.topics) {
        if (Array.isArray(req.query.topics)) {
          options.topics = req.query.topics as string[];
        } else {
          options.topics = (req.query.topics as string).split(',');
        }
      }
      
      // Xử lý các tham số thời gian
      if (req.query.timeFrom) options.timeFrom = req.query.timeFrom as string;
      if (req.query.timeTo) options.timeTo = req.query.timeTo as string;
      if (req.query.dateFrom) options.dateFrom = req.query.dateFrom as string;
      if (req.query.dateTo) options.dateTo = req.query.dateTo as string;
      
      // Lấy logs từ MikroTik service
      const result = await mikrotikService.getDeviceLogs(deviceId, options);
      
      if (!result.success) {
        return res.status(500).json(result);
      }
      
      res.json(result);
    } catch (error) {
      console.error("Lỗi khi lấy logs từ thiết bị:", error);
      res.status(500).json({ 
        success: false, 
        message: `Lỗi khi lấy logs: ${error instanceof Error ? error.message : String(error)}` 
      });
    }
  });

  // Interface routes
  router.get("/devices/:id/interfaces", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const interfaces = await storage.getInterfaces(deviceId);
      
      // Tính điểm sức khỏe cho mỗi interface
      if (req.query.includeHealth === 'true') {
        for (const iface of interfaces) {
          const health = interfaceHealthService.calculateHealthScore(iface);
          iface.healthScore = health.score;
        }
        // Lưu điểm sức khỏe vào cơ sở dữ liệu (nền)
        for (const iface of interfaces) {
          if (iface.healthScore !== undefined) {
            await storage.updateInterface(iface.id, { healthScore: iface.healthScore });
          }
        }
      }
      
      res.json(interfaces);
    } catch (error) {
      console.error("Error fetching interfaces:", error);
      res.status(500).json({ message: "Failed to fetch interfaces" });
    }
  });
  
  // Get interface health score
  router.get("/interfaces/:id/health", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const iface = await storage.getInterface(id);
      
      if (!iface) {
        return res.status(404).json({ message: "Interface not found" });
      }
      
      const health = interfaceHealthService.calculateHealthScore(iface);
      
      // Update the health score in the database
      await storage.updateInterface(id, { healthScore: health.score });
      
      res.json({
        id: iface.id,
        name: iface.name,
        ...health
      });
    } catch (error) {
      console.error("Error calculating interface health:", error);
      res.status(500).json({ message: "Failed to calculate interface health" });
    }
  });
  
  // Wireless Interface routes
  router.get("/devices/:id/wireless", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const wirelessInterfaces = await wirelessService.getWirelessInterfaces(deviceId);
      
      res.json(wirelessInterfaces);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wireless interfaces" });
    }
  });
  
  router.get("/wireless/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const wirelessInterface = await wirelessService.getWirelessInterface(id);
      
      if (!wirelessInterface) {
        return res.status(404).json({ message: "Wireless interface not found" });
      }
      
      res.json(wirelessInterface);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch wireless interface" });
    }
  });
  
  // CAPsMAN routes
  router.get("/devices/:id/capsman", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device || !device.hasCAPsMAN) {
        return res.status(200).json([]);
      }
      
      let capsmanAPs = await capsmanService.getCapsmanAPs(deviceId);
      
      // Trả về dữ liệu CAPsMAN APs thực tế - không tạo dữ liệu mẫu
      res.json(capsmanAPs || []);
    } catch (error) {
      console.error("Lỗi khi lấy CAPsMAN APs:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN APs" });
    }
  });
  
  router.get("/capsman/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      let capsmanAP = await capsmanService.getCapsmanAP(id);
      
      if (!capsmanAP) {
        return res.status(404).json({ message: "CAPsMAN AP not found" });
      }
      
      res.json(capsmanAP);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết CAPsMAN AP:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN AP" });
    }
  });
  
  // CAPsMAN Client routes
  router.get("/capsman/:id/clients", async (req: Request, res: Response) => {
    try {
      const apId = parseInt(req.params.id);
      let clients = await capsmanService.getCapsmanClients(apId);
      
      // Trả về danh sách clients thực tế - không tạo dữ liệu mẫu
      res.json(clients || []);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách clients:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN clients" });
    }
  });
  
  router.get("/capsman/client/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const client = await capsmanService.getCapsmanClient(id);
      
      if (!client) {
        return res.status(404).json({ message: "CAPsMAN client not found" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết client:", error);
      res.status(500).json({ message: "Failed to fetch CAPsMAN client" });
    }
  });
  
  router.get("/devices/:id/clients", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device || !device.hasCAPsMAN) {
        return res.status(200).json([]);
      }
      
      const clients = await capsmanService.getCapsmanClientsByDevice(deviceId);
      res.json(clients);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách clients theo thiết bị:", error);
      res.status(500).json({ message: "Failed to fetch clients by device" });
    }
  });

  // Alert routes
  router.get("/alerts", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const acknowledged = req.query.acknowledged !== undefined 
        ? req.query.acknowledged === 'true' 
        : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
      const alerts = await storage.getAlerts(deviceId, acknowledged, limit);
      res.json(alerts);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch alerts" });
    }
  });

  router.post("/alerts", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAlertSchema.parse(req.body);
      const alert = await storage.createAlert(validatedData);
      res.status(201).json(alert);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid alert data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create alert" });
    }
  });

  router.post("/alerts/:id/acknowledge", async (req: Request, res: Response) => {
    try {
      const alertId = parseInt(req.params.id);
      const alert = await storage.acknowledgeAlert(alertId);
      
      if (!alert) {
        return res.status(404).json({ message: "Alert not found" });
      }
      
      res.json(alert);
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alert" });
    }
  });

  router.post("/alerts/acknowledge-all", async (req: Request, res: Response) => {
    try {
      const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string) : undefined;
      const count = await storage.acknowledgeAllAlerts(deviceId);
      res.json({ acknowledged: count });
    } catch (error) {
      res.status(500).json({ message: "Failed to acknowledge alerts" });
    }
  });

  // Actions
  router.post("/devices/:id/refresh", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      // Sử dụng mikrotikService để collect các metrics cơ bản
      const success = await mikrotikService.collectDeviceMetrics(deviceId);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to collect device metrics" });
      }
      
      // Nếu thiết bị có wireless, collect wireless stats
      if (device.hasWireless) {
        await wirelessService.collectWirelessStats(deviceId);
      }
      
      // Nếu thiết bị có CAPsMAN, collect capsman stats
      if (device.hasCAPsMAN) {
        await capsmanService.collectCapsmanStats(deviceId);
      }
      
      res.json({ message: "Device metrics refreshed successfully" });
    } catch (error) {
      console.error("Error refreshing device metrics:", error);
      res.status(500).json({ message: "Failed to refresh device metrics" });
    }
  });

  router.post("/scheduler/polling-interval", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ interval: z.number().min(5000) });
      const { interval } = schema.parse(req.body);
      
      schedulerService.setPollingInterval(interval);
      res.json({ message: `Polling interval updated to ${interval}ms` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid interval", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update polling interval" });
    }
  });

  // Cập nhật số lượng thiết bị tối đa được polling cùng lúc
  router.post("/scheduler/max-concurrent-devices", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ count: z.number().min(1) });
      const { count } = schema.parse(req.body);
      
      schedulerService.setMaxConcurrentDevices(count);
      res.json({ message: `Max concurrent devices updated to ${count}` });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device count", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update max concurrent devices" });
    }
  });
  
  // Lấy trạng thái polling của các thiết bị
  router.get("/scheduler/device-status", async (_req: Request, res: Response) => {
    try {
      const deviceStatus = schedulerService.getDevicePollingStatus();
      return res.status(200).json(deviceStatus);
    } catch (error) {
      res.status(500).json({ message: "Failed to get device polling status" });
    }
  });
  
  // Tìm kiếm thiết bị mới trên mạng
  router.post("/devices/discover", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ subnet: z.string() });
      const { subnet } = schema.parse(req.body);
      
      const discoveredCount = await mikrotikService.discoverDevices(subnet);
      return res.status(200).json({ 
        message: `Network discovery completed`, 
        discoveredCount 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid subnet format", errors: error.errors });
      }
      console.error("Error during network discovery:", error);
      return res.status(500).json({ message: "Failed to discover devices on network" });
    }
  });
  
  // Lấy thông tin thiết bị từ trang web MikroTik
  router.get("/device-info/:model", async (req: Request, res: Response) => {
    try {
      const modelName = req.params.model;
      if (!modelName) {
        return res.status(400).json({ message: "Model name is required" });
      }
      
      const deviceInfo = await deviceInfoService.getDeviceInfo(modelName);
      
      if (deviceInfo.error) {
        return res.status(404).json({ message: deviceInfo.error });
      }
      
      res.json(deviceInfo);
    } catch (error) {
      console.error("Lỗi khi lấy thông tin thiết bị:", error);
      res.status(500).json({ message: "Failed to fetch device information" });
    }
  });
  
  // Lấy thông tin phiên bản RouterOS
  router.get("/routeros-info/:version?", async (req: Request, res: Response) => {
    try {
      const version = req.params.version;
      const routerOSInfo = await deviceInfoService.getRouterOSInfo(version);
      
      if (typeof routerOSInfo === 'object' && 'error' in routerOSInfo) {
        return res.status(404).json({ message: routerOSInfo.error });
      }
      
      res.json(routerOSInfo);
    } catch (error) {
      console.error("Lỗi khi lấy thông tin RouterOS:", error);
      res.status(500).json({ message: "Failed to fetch RouterOS information" });
    }
  });
  
  // Làm phong phú thông tin thiết bị với dữ liệu từ web
  router.post("/devices/:id/enrich", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await storage.getDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Device not found" });
      }
      
      const enrichedDevice = await deviceInfoService.enrichDeviceInfo(device);
      
      // Cập nhật thiết bị trong cơ sở dữ liệu
      if (enrichedDevice !== device) {
        const updatedDevice = await storage.updateDevice(deviceId, enrichedDevice);
        return res.json(updatedDevice);
      }
      
      res.json(device);
    } catch (error) {
      console.error("Lỗi khi làm phong phú thông tin thiết bị:", error);
      res.status(500).json({ message: "Failed to enrich device information" });
    }
  });

  // Register the router with the prefix
  // Client Management routes
  router.get("/clients", async (_req: Request, res: Response) => {
    try {
      const devices = await clientManagementService.getNetworkDevices();
      res.json(devices);
    } catch (error) {
      console.error('Error fetching clients:', error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });
  
  router.get("/clients/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID"
        });
      }
      
      const device = await clientManagementService.checkDeviceStatus(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false,
          message: "Client not found" 
        });
      }
      
      // Get detailed information if available
      let deviceDetails = device;
      
      try {
        // Get device from DB to get any stored information
        const dbDevice = await db.select()
          .from(networkDevices)
          .where(eq(networkDevices.id, deviceId))
          .limit(1);
          
        if (dbDevice && dbDevice.length > 0) {
          deviceDetails = {
            ...dbDevice[0],
            ...deviceDetails
          };
        }
      } catch (detailsError) {
        console.error(`Error getting device details for ID ${deviceId}:`, detailsError);
      }
      
      res.json({
        success: true,
        device: deviceDetails
      });
    } catch (error) {
      console.error('Error fetching client:', error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch client" 
      });
    }
  });
  
  router.post("/clients/:id/identify", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      
      if (isNaN(deviceId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid device ID"
        });
      }
      
      // Identify the device
      const device = await deviceIdentificationService.identifyDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({
          success: false,
          message: "Device not found or could not be identified"
        });
      }
      
      // Add role and monitoring method information
      try {
        const role = await deviceClassifierService.classifyDevice(deviceId);
        const monitoringMethods = deviceClassifierService.getMonitoringMethodsForRole(role);
        
        const enhancedDevice = {
          ...device,
          role,
          monitoring: monitoringMethods
        };
        
        res.json({
          success: true,
          message: "Device identified successfully",
          device: enhancedDevice
        });
      } catch (classifyError) {
        console.error(`Error classifying device ID ${deviceId}:`, classifyError);
        
        res.json({
          success: true,
          message: "Device identified successfully, but classification failed",
          device
        });
      }
    } catch (error) {
      console.error(`Error identifying device ID ${req.params.id}:`, error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to identify device" 
      });
    }
  });
  
  router.post("/clients/add-device", async (req: Request, res: Response) => {
    try {
      const schema = z.object({
        ipAddress: z.string(),
        macAddress: z.string(),
        hostName: z.string().optional(),
        interface: z.string().optional()
      });
      
      const validatedData = schema.parse(req.body);
      
      // Create a network device object from the validated data
      const device = {
        ipAddress: validatedData.ipAddress,
        macAddress: validatedData.macAddress,
        hostName: validatedData.hostName,
        interface: validatedData.interface
      };
      
      const added = await clientManagementService.addDeviceToMonitoring(device as NetworkDeviceDetails);
      
      if (!added) {
        return res.status(500).json({ 
          success: false, 
          message: "Failed to add device to monitoring" 
        });
      }
      
      res.status(201).json({ 
        success: true, 
        message: "Device added to monitoring successfully", 
        device: added 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          success: false, 
          message: "Invalid device data", 
          errors: error.errors 
        });
      }
      console.error('Error adding device to monitoring:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to add device to monitoring" 
      });
    }
  });
  
  router.post("/clients/refresh-all", async (_req: Request, res: Response) => {
    try {
      const devices = await clientManagementService.refreshAllDeviceStatus();
      
      res.json({
        success: true,
        message: "Device statuses refreshed successfully",
        devices
      });
    } catch (error) {
      console.error('Error refreshing all device statuses:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to refresh device statuses" 
      });
    }
  });
  
  // API để quét mạng tìm thiết bị
  router.post("/clients/scan", async (req: Request, res: Response) => {
    try {
      const { subnet, autoDetect, routerId } = req.body;
      
      if (!routerId) {
        return res.status(400).json({ 
          success: false, 
          message: "Router ID is required" 
        });
      }
      
      console.log(`Thực hiện quét mạng với routerId = ${routerId}, subnet = ${subnet || 'auto'}`);
      
      // Kiểm tra kết nối đến router
      try {
        const router = await storage.getDevice(routerId);
        if (!router) {
          return res.status(404).json({ 
            success: false, 
            message: "Router not found" 
          });
        }
        
        console.log(`Kiểm tra kết nối đến router ${router.name} (${router.ipAddress})`);
        
        // Thử kết nối đến router và lấy thông tin từ router
        const connected = await mikrotikService.connectToDevice(routerId);
        
        if (!connected) {
          return res.status(400).json({ 
            success: false, 
            message: "Could not connect to router. Please check router credentials." 
          });
        }
        
        console.log(`Kết nối thành công đến router ${router.name}`);
        
        // Lấy thông tin ARP table
        const arpEntries = await mikrotikService.getArpEntries(routerId);
        console.log(`Tìm thấy ${arpEntries.length} bản ghi ARP từ router ${router.name}`);
        
        // Lấy thông tin DHCP leases
        const dhcpLeases = await mikrotikService.getDhcpLeases(routerId);
        console.log(`Tìm thấy ${dhcpLeases.length} bản ghi DHCP từ router ${router.name}`);
        
        // Ngắt kết nối
        await mikrotikService.disconnectFromDevice(routerId);
        
        // Tiếp tục quá trình quét mạng bình thường
        console.log(`Bắt đầu quét mạng với subnet = ${subnet || 'auto'}`);
      } catch (routerError) {
        console.error(`Lỗi khi kiểm tra router: ${routerError}`);
      }
      
      // Quét mạng
      const devices = await clientManagementService.scanNetwork(subnet);
      
      if (devices.length > 0) {
        // Thêm các thiết bị vào hệ thống
        const addedDevices = [];
        for (const device of devices) {
          const added = await clientManagementService.addDeviceToMonitoring(device);
          if (added) {
            addedDevices.push(added);
          }
        }
        
        res.json({
          success: true,
          message: `Scanned network and found ${devices.length} devices`,
          devices: addedDevices
        });
      } else {
        // Thử phương pháp quét thay thế
        console.log("Không tìm thấy thiết bị từ phương pháp quét thông thường, thử phương pháp quét trực tiếp");
        
        // Lấy thông tin neighbor trực tiếp từ router
        const directDevices = await mikrotikService.getNetworkNeighbors({ id: routerId });
        console.log(`Phát hiện ${directDevices.length} thiết bị bằng phương pháp trực tiếp`);
        
        if (directDevices.length > 0) {
          // Thêm các thiết bị vào hệ thống
          const addedDevices = [];
          for (const device of directDevices) {
            if (!device.macAddress) continue;
            
            // Tạo đối tượng NetworkDeviceDetails từ thông tin neighbor
            const networkDevice = {
              ipAddress: device.ipAddress || '',
              macAddress: device.macAddress,
              hostname: device.hostName || device.identity || undefined,
              interface: device.interface || undefined,
              deviceType: 'Unknown',
              firstSeen: new Date(),
              lastSeen: new Date(),
              isOnline: true
            };
            
            const added = await clientManagementService.addDeviceToMonitoring(networkDevice);
            if (added) {
              addedDevices.push(added);
            }
          }
          
          res.json({
            success: true,
            message: `Scanned network with direct method and found ${directDevices.length} devices`,
            devices: addedDevices
          });
        } else {
          res.json({
            success: true,
            message: "No devices found in network scan with any method",
            devices: []
          });
        }
      }
    } catch (error) {
      console.error('Error scanning network:', error);
      res.status(500).json({ 
        success: false, 
        message: `Failed to scan network: ${error.message}` 
      });
    }
  });
  
  router.post("/clients/:id/refresh", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await clientManagementService.checkDeviceStatus(deviceId);
      
      if (!device) {
        return res.status(404).json({ 
          success: false,
          message: "Device not found" 
        });
      }
      
      res.json({
        success: true,
        message: "Device status refreshed successfully",
        device
      });
    } catch (error) {
      console.error(`Error refreshing device status for ID ${req.params.id}:`, error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to refresh device status" 
      });
    }
  });
  
  router.post("/clients/:id/traffic", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      
      // Simple traffic data for testing
      const trafficData = {
        txBytes: Math.floor(Math.random() * 10000000),
        rxBytes: Math.floor(Math.random() * 10000000),
        txRate: Math.floor(Math.random() * 1000000),
        rxRate: Math.floor(Math.random() * 1000000)
      };
      
      const updated = await clientManagementService.updateDeviceTraffic(deviceId, trafficData);
      
      if (!updated) {
        return res.status(404).json({ 
          success: false,
          message: "Device not found or traffic update failed" 
        });
      }
      
      res.json({
        success: true,
        message: "Device traffic updated successfully",
        device: updated,
        trafficData
      });
    } catch (error) {
      console.error(`Error updating device traffic for ID ${req.params.id}:`, error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update device traffic" 
      });
    }
  });
  
  // Network Discovery routes
  router.get("/network-devices", async (req: Request, res: Response) => {
    try {
      const isIdentified = req.query.identified ? req.query.identified === 'true' : undefined;
      const vendor = req.query.vendor as string | undefined;
      const minScore = req.query.minScore ? parseInt(req.query.minScore as string) : undefined;
      
      const devices = await discoveryService.getNetworkDevices({
        isIdentified,
        vendor,
        minIdentificationScore: minScore
      });
      
      // Get updated online status for all devices
      const devicesWithStatus = await clientManagementService.getNetworkDevices();
      
      // Merge the status information with the device data
      const mergedDevices = devices.map(device => {
        const statusDevice = devicesWithStatus.find(d => d.ipAddress === device.ipAddress);
        return {
          ...device,
          isOnline: statusDevice ? statusDevice.isOnline : false
        };
      });
      
      res.json(mergedDevices);
    } catch (error) {
      console.error('Error fetching network devices:', error);
      res.status(500).json({ message: "Failed to fetch network devices" });
    }
  });

  router.get("/network-devices/:id", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const [device] = await db.select()
        .from(networkDevices)
        .where(eq(networkDevices.id, deviceId));
      
      if (!device) {
        return res.status(404).json({ message: "Network device not found" });
      }
      
      // Lấy lịch sử phát hiện thiết bị
      const history = await discoveryService.getDeviceDiscoveryHistory(deviceId);
      
      res.json({ device, history });
    } catch (error) {
      console.error('Error fetching network device:', error);
      res.status(500).json({ message: "Failed to fetch network device" });
    }
  });

  router.post("/network-devices", async (req: Request, res: Response) => {
    try {
      const validatedData = insertNetworkDeviceSchema.parse(req.body);
      const device = await discoveryService.detectDevice(
        validatedData.ipAddress,
        validatedData.macAddress,
        'manual',
        undefined,
        validatedData.deviceData || {}
      );
      
      res.status(201).json(device);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid device data", errors: error.errors });
      }
      console.error('Error creating network device:', error);
      res.status(500).json({ message: "Failed to create network device" });
    }
  });

  router.post("/network-devices/:id/identify", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const device = await deviceIdentificationService.identifyDevice(deviceId);
      
      if (!device) {
        return res.status(404).json({ message: "Network device not found" });
      }
      
      // Phân loại thiết bị sau khi đã nhận diện
      const role = await deviceClassifierService.classifyDevice(deviceId);
      
      // Thêm thông tin về vai trò và phương thức giám sát phù hợp
      const monitoringMethods = deviceClassifierService.getMonitoringMethodsForRole(role);
      
      res.json({
        ...device,
        role,
        monitoring: monitoringMethods
      });
    } catch (error) {
      console.error('Error identifying network device:', error);
      res.status(500).json({ message: "Failed to identify network device" });
    }
  });

  router.post("/discovery/scan", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ subnet: z.string().optional() });
      const { subnet } = schema.parse(req.body);
      
      const result = await schedulerService.runManualDiscovery(subnet);
      res.json(result);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid data", errors: error.errors });
      }
      console.error('Error running network discovery scan:', error);
      res.status(500).json({ message: "Failed to run network discovery scan" });
    }
  });

  router.post("/discovery/dhcp/:deviceId", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.deviceId);
      const result = await schedulerService.runManualRouterDiscovery(deviceId);
      res.json(result);
    } catch (error) {
      console.error(`Error scanning DHCP from device ${req.params.deviceId}:`, error);
      res.status(500).json({ message: "Failed to scan DHCP from router" });
    }
  });

  router.get("/discovery/status", async (_req: Request, res: Response) => {
    try {
      const status = schedulerService.getStatus();
      res.json(status);
    } catch (error) {
      console.error('Error getting discovery status:', error);
      res.status(500).json({ message: "Failed to get discovery status" });
    }
  });

  router.post("/discovery/interval", async (req: Request, res: Response) => {
    try {
      const schema = z.object({ 
        discoveryScanInterval: z.number().min(1).optional(),
        identificationScanInterval: z.number().min(1).optional(),
        routerDiscoveryInterval: z.number().min(1).optional()
      });
      
      const intervals = schema.parse(req.body);
      const result: Record<string, number> = {};
      
      if (intervals.discoveryScanInterval) {
        result.discoveryScanInterval = schedulerService.setDiscoveryScanInterval(intervals.discoveryScanInterval);
      }
      
      if (intervals.identificationScanInterval) {
        result.identificationScanInterval = schedulerService.setIdentificationScanInterval(intervals.identificationScanInterval);
      }
      
      if (intervals.routerDiscoveryInterval) {
        result.routerDiscoveryInterval = schedulerService.setRouterDiscoveryInterval(intervals.routerDiscoveryInterval);
      }
      
      res.json({ message: "Scan intervals updated", intervals: result });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid interval data", errors: error.errors });
      }
      console.error('Error updating scan intervals:', error);
      res.status(500).json({ message: "Failed to update scan intervals" });
    }
  });

  router.post("/oui-database/update", async (_req: Request, res: Response) => {
    try {
      const result = await discoveryService.updateOuiDatabase();
      if (result) {
        res.json({ message: "OUI database updated successfully" });
      } else {
        res.status(500).json({ message: "Failed to update OUI database" });
      }
    } catch (error) {
      console.error('Error updating OUI database:', error);
      res.status(500).json({ message: "Failed to update OUI database" });
    }
  });

  router.get("/mac-vendors/:mac", async (req: Request, res: Response) => {
    try {
      const macAddress = req.params.mac;
      const vendor = await discoveryService.lookupVendor(macAddress);
      
      if (vendor) {
        res.json({ macAddress, vendor });
      } else {
        res.status(404).json({ message: "Vendor not found for MAC address" });
      }
    } catch (error) {
      console.error('Error looking up MAC vendor:', error);
      res.status(500).json({ message: "Failed to lookup MAC vendor" });
    }
  });
  
  // Phân loại thiết bị mạng dựa trên thông tin nhận diện
  router.post("/network-devices/:id/classify", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const role = await deviceClassifierService.classifyDevice(deviceId);
      
      if (!role) {
        return res.status(404).json({ message: "Network device not found or could not be classified" });
      }
      
      // Lấy thông tin về phương pháp giám sát phù hợp
      const monitoringMethods = deviceClassifierService.getMonitoringMethodsForRole(role);
      
      res.json({ 
        deviceId, 
        role,
        monitoring: monitoringMethods,
        message: `Device classified as ${role}`
      });
    } catch (error) {
      console.error('Error classifying network device:', error);
      res.status(500).json({ message: "Failed to classify network device" });
    }
  });
  
  // Phân loại lại tất cả các thiết bị đã nhận diện
  router.post("/network-devices/reclassify-all", async (_req: Request, res: Response) => {
    try {
      const count = await deviceClassifierService.reclassifyAllDevices();
      res.json({ 
        message: `Successfully reclassified ${count} devices`,
        count
      });
    } catch (error) {
      console.error('Error reclassifying all devices:', error);
      res.status(500).json({ message: "Failed to reclassify all devices" });
    }
  });
  
  // Quét mạng để tìm thiết bị MikroTik
  router.post("/network-scan", async (req: Request, res: Response) => {
    try {
      const { networks, autoDetect, concurrent } = req.body;
      
      if (!networks && !autoDetect) {
        return res.status(400).json({ 
          message: "Phải cung cấp danh sách mạng (networks) hoặc bật tự động phát hiện (autoDetect)" 
        });
      }
      
      let result;
      if (autoDetect) {
        result = await networkScannerService.autoDetectAndScan(concurrent);
      } else {
        result = await networkScannerService.scanNetworks(networks, concurrent);
      }
      
      res.json({ 
        message: `Đã tìm thấy ${result.length} thiết bị MikroTik`,
        devices: result
      });
    } catch (error: any) {
      console.error('Error scanning network:', error);
      res.status(500).json({ message: "Lỗi khi quét mạng", error: error.message });
    }
  });
  
  // Quét một địa chỉ IP cụ thể
  router.post("/network-scan/ip", async (req: Request, res: Response) => {
    try {
      const { ip } = req.body;
      
      if (!ip) {
        return res.status(400).json({ message: "Phải cung cấp địa chỉ IP" });
      }
      
      const result = await networkScannerService.scanSingleIp(ip);
      
      if (result.length > 0) {
        res.json({ 
          message: `Đã tìm thấy thiết bị MikroTik tại ${ip}`,
          device: result[0]
        });
      } else {
        res.json({ 
          message: `Không tìm thấy thiết bị MikroTik tại ${ip}`,
          device: null
        });
      }
    } catch (error: any) {
      console.error('Error scanning IP:', error);
      res.status(500).json({ message: "Lỗi khi quét địa chỉ IP", error: error.message });
    }
  });
  
  // Thu thập dữ liệu lưu lượng mạng cho thiết bị cụ thể
  router.post("/network-devices/:id/collect-traffic", async (req: Request, res: Response) => {
    try {
      const deviceId = parseInt(req.params.id);
      const result = await collectAndBroadcastTraffic(deviceId);
      
      if (!result || !result.success) {
        return res.status(404).json({ 
          message: "Failed to collect traffic data", 
          details: result ? result.message : "Unknown error" 
        });
      }
      
      // Lưu dữ liệu lưu lượng vào cơ sở dữ liệu
      await trafficCollectorService.saveTrafficData(deviceId, result.data);
      
      res.json({
        deviceId,
        method: result.method,
        data: result.data,
        message: `Successfully collected traffic data using ${result.method} method`
      });
    } catch (error) {
      console.error('Error collecting traffic data:', error);
      res.status(500).json({ message: "Failed to collect traffic data" });
    }
  });

  app.use("/api", router);

  const httpServer = createServer(app);
  
  // WebSocket server setup
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws'
  });
  
  // Store active connections and their subscriptions
  const clients = new Map<WebSocket, Set<string>>();
  
  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');
    
    // Initialize client subscriptions
    clients.set(ws, new Set());
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.action === 'subscribe' && typeof data.topic === 'string') {
          // Add subscription to client
          const topics = clients.get(ws);
          if (topics) {
            topics.add(data.topic);
            console.log(`Client subscribed to topic: ${data.topic}`);
          }
        } else if (data.action === 'unsubscribe' && typeof data.topic === 'string') {
          // Remove subscription from client
          const topics = clients.get(ws);
          if (topics) {
            topics.delete(data.topic);
            console.log(`Client unsubscribed from topic: ${data.topic}`);
          }
        }
      } catch (err) {
        console.error('Invalid WebSocket message:', err);
      }
    });
    
    ws.on('close', () => {
      // Remove client from active connections
      clients.delete(ws);
      console.log('WebSocket client disconnected');
    });
    
    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      timestamp: new Date().toISOString()
    }));
  });
  
  // Helper function to broadcast to all subscribed clients
  const broadcastToTopic = (topic: string, data: any) => {
    const message = JSON.stringify(data);
    
    for (const [client, topics] of clients.entries()) {
      if (client.readyState === WebSocket.OPEN && topics.has(topic)) {
        client.send(message);
      }
    }
  };
  
  // Expose broadcast function globally
  (global as any).broadcastToTopic = broadcastToTopic;
  
  // Subscribe to metric collection events - use a different approach
  // Instead of modifying the service method, we'll create a wrapper function
  const collectAndBroadcastTraffic = async (deviceId: number) => {
    const result = await trafficCollectorService.collectTrafficByDeviceRole(deviceId);
    
    // If collection was successful, broadcast to subscribed clients
    if (result && result.success) {
      const topic = `device_traffic_${deviceId}`;
      const data = {
        type: 'traffic_update',
        deviceId,
        timestamp: new Date().toISOString(),
        downloadBandwidth: result.data?.trafficData?.[0]?.download || 0,
        uploadBandwidth: result.data?.trafficData?.[0]?.upload || 0,
        method: result.method
      };
      
      broadcastToTopic(topic, data);
      
      // Also broadcast to the global traffic topic
      broadcastToTopic('all_traffic', data);
    }
    
    return result;
  };
  
  return httpServer;
}
