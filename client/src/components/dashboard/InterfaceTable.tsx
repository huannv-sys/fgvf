import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Interface } from "@shared/schema";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";

interface InterfaceTableProps {
  deviceId: number | null;
}

interface InterfaceData {
  id: number;
  name: string;
  type: string | null;
  status: 'up' | 'down';
  macAddress: string | null;
  speed: string | null;
  rxBytes: number | null;
  txBytes: number | null;
  comment: string | null;
  disabled: boolean;
}

const InterfaceTable: React.FC<InterfaceTableProps> = ({ deviceId }) => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: interfaces, isLoading } = useQuery<Interface[]>({
    queryKey: deviceId ? ['/api/devices', deviceId, 'interfaces'] : ['empty'],
    enabled: !!deviceId,
    refetchInterval: 30000, // Refresh every 30 seconds
  });
  
  // Mutation để bật/tắt interface
  const toggleInterfaceMutation = useMutation({
    mutationFn: async ({ interfaceId, enable }: { interfaceId: number; enable: boolean }) => {
      const response = await fetch(`/api/interfaces/${interfaceId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, enable })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Lỗi khi thay đổi trạng thái interface');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Hiển thị thông báo thành công
      toast({
        title: "Thành công",
        description: data.message,
        variant: "default",
      });
      
      // Làm mới dữ liệu interface
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/devices', deviceId, 'interfaces'] });
      }, 500);
    },
    onError: (error: Error) => {
      // Hiển thị thông báo lỗi
      toast({
        title: "Lỗi",
        description: error.message,
        variant: "destructive",
      });
    }
  });

  if (isLoading) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Format and prepare interface data
  const formatInterfaceData = (ifaces: Interface[] | undefined): InterfaceData[] => {
    if (!ifaces || !Array.isArray(ifaces) || ifaces.length === 0) {
      return [];
    }
    
    return ifaces.map(iface => {
      // Kiểm tra đặc biệt cho CAP interfaces
      const isCAPInterface = 
        (iface.type === 'cap' || iface.type === 'CAP') || 
        (iface.name && (iface.name.toLowerCase().includes('cap') || iface.name.toLowerCase().includes('wlan')));
      
      // Đảm bảo interfaces CAP luôn hiển thị UP khi không bị vô hiệu hóa
      const isUp = iface.isUp || (isCAPInterface && !iface.disabled);
      
      return {
        id: iface.id,
        name: iface.name,
        type: iface.type || 'Physical',
        status: isUp ? 'up' : 'down',
        macAddress: iface.macAddress,
        speed: iface.speed || (isUp ? '1Gbps' : null),
        rxBytes: iface.rxBytes,
        txBytes: iface.txBytes,
        comment: iface.comment,
        disabled: iface.disabled || false
      };
    });
  };

  // Get real interface data
  const displayInterfaces = formatInterfaceData(interfaces);

  // Format bytes to readable format
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  return (
    <div className="bg-slate-900 rounded-lg shadow-md border border-slate-700">
      <div className="px-4 py-3 border-b border-slate-700 bg-slate-800 flex items-center justify-between">
        <h3 className="font-medium text-white text-lg">Network Interfaces</h3>
        <div className="flex items-center">
          <span className="text-xs text-slate-400">{displayInterfaces.length} interfaces</span>
          <span className="inline-flex h-2 w-2 rounded-full bg-green-500 ml-2"></span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-800 border-b border-slate-700">
            <tr>
              <th className="text-xs text-slate-400 font-semibold p-2">Type</th>
              <th className="text-xs text-slate-400 font-semibold p-2">Name</th>
              <th className="text-xs text-slate-400 font-semibold p-2">Status</th>
              <th className="text-xs text-slate-400 font-semibold p-2">MAC</th>
              <th className="text-xs text-slate-400 font-semibold p-2">Speed</th>
              <th className="text-xs text-slate-400 font-semibold p-2">MTU</th>
              <th className="text-xs text-slate-400 font-semibold p-2">RX</th>
              <th className="text-xs text-slate-400 font-semibold p-2">TX</th>
              <th className="text-xs text-slate-400 font-semibold p-2">Comment</th>
              <th className="text-xs text-slate-400 font-semibold p-2">Enable/Disable</th>
            </tr>
          </thead>
          <tbody>
            {displayInterfaces.length > 0 ? (
              displayInterfaces.map((iface) => (
                <tr key={iface.id} className="border-b border-slate-800 hover:bg-slate-800/50">
                  <td className="text-slate-300 text-xs p-2 whitespace-nowrap">{iface.type}</td>
                  <td className="text-slate-300 text-xs p-2 font-medium whitespace-nowrap">{iface.name}</td>
                  <td className="p-2">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded ${iface.status === 'up' ? 'bg-green-500/30 text-green-400 border border-green-400' : 'bg-red-500/30 text-red-400 border border-red-400'}`}>
                      {iface.status === 'up' ? '🟢 UP' : '🔴 DOWN'}
                    </span>
                  </td>
                  <td className="text-slate-300 text-xs p-2 font-mono">{iface.macAddress || '-'}</td>
                  <td className="text-slate-300 text-xs p-2">{iface.speed || '-'}</td>
                  <td className="text-slate-300 text-xs p-2">1500</td>
                  <td className="text-slate-300 text-xs p-2">{formatBytes(iface.rxBytes || 0)}</td>
                  <td className="text-slate-300 text-xs p-2">{formatBytes(iface.txBytes || 0)}</td>
                  <td className="text-slate-300 text-xs p-2 max-w-[200px] truncate">{iface.comment || '-'}</td>
                  <td className="text-slate-300 text-xs p-2">
                    <div className="flex items-center justify-center">
                      <div className="flex flex-col items-center">
                        <Switch
                          checked={!iface.disabled}
                          onCheckedChange={(checked) => {
                            toggleInterfaceMutation.mutate({
                              interfaceId: iface.id,
                              enable: checked
                            });
                          }}
                          disabled={toggleInterfaceMutation.isPending}
                          className="data-[state=checked]:bg-green-500"
                        />
                        <span className="text-[10px] mt-1 font-medium">
                          {!iface.disabled ? "ENABLED" : "DISABLED"}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={10} className="text-center p-4 text-slate-400">
                  Không có interfaces nào được tìm thấy
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default InterfaceTable;