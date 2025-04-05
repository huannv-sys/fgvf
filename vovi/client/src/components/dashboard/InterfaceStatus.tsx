import { useQuery } from "@tanstack/react-query";
import { Interface } from "@shared/schema";

interface InterfaceStatusProps {
  deviceId: number | null;
}

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
};

const InterfaceStatus: React.FC<InterfaceStatusProps> = ({ deviceId }) => {
  const { data: interfaces, isLoading } = useQuery<Interface[]>({ 
    queryKey: [`/api/devices/${deviceId ?? 0}/interfaces`, { includeHealth: true }],
    enabled: !!deviceId,
  });
  
  // Get the color class based on health score
  const getHealthScoreColorClass = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'text-gray-400';
    if (score >= 90) return 'text-green-500';
    if (score >= 70) return 'text-blue-500';
    if (score >= 50) return 'text-yellow-500';
    if (score >= 20) return 'text-orange-500';
    return 'text-red-500';
  };
  
  // Get the health status text based on score
  const getHealthStatusText = (score: number | null | undefined): string => {
    if (score === null || score === undefined) return 'Unknown';
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    if (score >= 20) return 'Poor';
    return 'Critical';
  };
  
  return (
    <div className="bg-gray-800 rounded-lg shadow-md border border-gray-700">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <div className="flex items-center">
          <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
          <h3 className="font-bold text-white">Trạng thái Interfaces</h3>
        </div>
        {!isLoading && interfaces && <span className="text-xs text-green-400 font-bold">{interfaces.length} interfaces</span>}
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
          </div>
        ) : interfaces && interfaces.length > 0 ? (
          interfaces.map((iface: Interface) => (
            <div key={iface.id} className={`mb-3 last:mb-0 border rounded-md p-2 ${iface.isUp ? 'border-green-500 bg-gray-800' : 'border-red-500 bg-gray-800'}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${iface.isUp ? 'bg-green-500' : 'bg-red-500'} mr-2 animate-pulse`}></div>
                  <span className="font-bold text-sm text-white">
                    {iface.name || 'Unknown Interface'} {iface.type && <span className="text-xs font-semibold text-gray-300">({iface.type})</span>}
                  </span>
                </div>
                <div className="flex items-center">
                  <span className={`text-xs font-bold mr-2 px-2 py-0.5 rounded-full ${getHealthScoreColorClass(iface.healthScore).replace('text-', 'bg-')} text-white`}>
                    {getHealthStatusText(iface.healthScore)}
                  </span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${iface.isUp ? 'bg-blue-600 text-white' : 'bg-red-600 text-white'}`}>
                    {iface.isUp ? iface.speed || '1Gbps' : 'Disconnected'}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs font-medium mt-2">
                <div className="flex items-center">
                  <span className="flex items-center mr-3 bg-blue-600 text-white px-2 py-1 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                    </svg>
                    TX: {iface.txBytes != null ? formatBytes(iface.txBytes) : '0 B'}
                  </span>
                  <span className="flex items-center bg-green-600 text-white px-2 py-1 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                    </svg>
                    RX: {iface.rxBytes != null ? formatBytes(iface.rxBytes) : '0 B'}
                  </span>
                </div>
                {iface.healthScore != null && (
                  <span className={`px-2 py-1 rounded-md font-bold ${getHealthScoreColorClass(iface.healthScore).replace('text-', 'bg-')} text-white`}>
                    {iface.healthScore}/100
                  </span>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm font-medium text-red-500 text-center py-8 border border-dashed border-red-300 rounded-md">
            Không có interfaces khả dụng
          </div>
        )}
      </div>
    </div>
  );
};

export default InterfaceStatus;
