import { useQuery } from "@tanstack/react-query";
import { Device } from "@shared/schema";
import { useEffect, useState } from "react";

interface DeviceInfoProps {
  deviceId: number | null;
}

const DeviceInfo: React.FC<DeviceInfoProps> = ({ deviceId }) => {
  const [deviceData, setDeviceData] = useState<Device | null>(null);
  
  // Sửa endpoint để khớp với API
  const deviceEndpoint = deviceId ? `/api/devices/${deviceId}` : null;
  
  const { data: device, isLoading } = useQuery<Device>({ 
    queryKey: deviceEndpoint ? [deviceEndpoint] : ['empty-device'],
    enabled: !!deviceId,
    refetchInterval: 5000, // Refresh device info every 5 seconds
  });
  
  // Log dữ liệu thiết bị khi nhận được để debug
  useEffect(() => {
    if (device) {
      console.log("Device data received:", device);
      setDeviceData(device);
    }
  }, [device]);
  
  const formatLastSeen = (date: string | Date | null | undefined) => {
    if (!date) return 'Never';
    
    const lastSeen = new Date(date);
    return lastSeen.toLocaleString();
  };
  
  return (
    <div className="bg-slate-800 rounded-lg shadow-sm border border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700">
        <h3 className="font-medium text-white">Device Information</h3>
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : deviceData ? (
          <div className="grid grid-cols-1 gap-4">
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Model</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.model || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Serial Number</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.serialNumber || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">RouterOS Version</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.routerOsVersion || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Firmware</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.firmware || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">CPU</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.cpu || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Total Memory</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.totalMemory || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Storage</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.storage || 'Chưa có thông tin'}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Last Updated</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {formatLastSeen(deviceData.lastSeen)}
              </div>
            </div>
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Status</div>
              <div className="w-2/3 text-sm font-medium flex items-center">
                <span className={`inline-block w-2 h-2 rounded-full mr-2 ${deviceData.isOnline ? 'bg-green-500' : 'bg-red-500'}`}></span>
                <span className={deviceData.isOnline ? 'text-green-400' : 'text-red-400'}>
                  {deviceData.isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
            </div>
            {deviceData.uptime && (
            <div className="flex">
              <div className="w-1/3 text-sm text-slate-400">Uptime</div>
              <div className="w-2/3 text-sm font-medium text-white overflow-hidden text-ellipsis">
                {deviceData.uptime}
              </div>
            </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-slate-400 text-center py-8">
            No device information available
          </div>
        )}
      </div>
    </div>
  );
};

export default DeviceInfo;
