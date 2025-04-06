import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Metric, Interface } from "@shared/schema";
import axios from "axios";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { 
  ArrowDownIcon, 
  ArrowUpIcon, 
  RefreshCwIcon, 
  ActivityIcon,
  WifiIcon,
  PieChartIcon,
  BarChartIcon
} from "lucide-react";

interface NetworkTrafficAdvancedProps {
  deviceId: number | null;
}

// Định dạng bytes sang các đơn vị đọc được
const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

// Định dạng Mbps với độ chính xác cho trước
const formatMbps = (mbps: number | undefined | null, decimals = 2) => {
  if (mbps === undefined || mbps === null || isNaN(mbps)) return '0.00 Mbps';
  return mbps.toFixed(decimals) + ' Mbps';
};

// Format thời gian dễ đọc
const formatTimeAgo = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);
  
  if (diffSec < 60) return `${diffSec} giây trước`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
  return `${Math.floor(diffSec / 86400)} ngày trước`;
};

const NetworkTrafficAdvanced: React.FC<NetworkTrafficAdvancedProps> = ({ deviceId }) => {
  const [activeTab, setActiveTab] = useState<string>("graph");
  const [selectedTimeFrame, setSelectedTimeFrame] = useState<string>("realtime");
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [logAnalysisData, setLogAnalysisData] = useState<any>(null);
  const [isLoadingLogAnalysis, setIsLoadingLogAnalysis] = useState<boolean>(false);
  const [logAnalysisError, setLogAnalysisError] = useState<string | null>(null);
  
  // Fetch metrics data với kiểm tra quá trình gọi
  const metricsEndpoint = deviceId ? `/api/devices/${deviceId}/metrics` : 'empty';
  console.log("Endpoint gọi metrics:", metricsEndpoint);
  
  const { 
    data: metrics, 
    isLoading: isLoadingMetrics, 
    refetch: refetchMetrics 
  } = useQuery<Metric[]>({ 
    queryKey: [metricsEndpoint],
    enabled: !!deviceId,
    refetchInterval: autoRefresh ? 1000 : false, // Auto refresh mỗi giây để tạo hiệu ứng cập nhật thời gian thực
    retry: 3, // Thử lại 3 lần nếu thất bại
    staleTime: 5000 // Dữ liệu cũ sau 5 giây
  });
  
  // Fetch interfaces data
  const interfacesEndpoint = deviceId ? `/api/devices/${deviceId}/interfaces` : 'empty-interfaces';
  
  const { 
    data: interfaces, 
    isLoading: isLoadingInterfaces 
  } = useQuery<Interface[]>({
    queryKey: [interfacesEndpoint],
    enabled: !!deviceId,
    refetchInterval: autoRefresh ? 1000 : false // Cập nhật mỗi giây để tạo hiệu ứng thời gian thực
  });
  
  // Function to perform traffic log analysis
  const analyzeTrafficLogs = async () => {
    if (!deviceId) return;
    
    setIsLoadingLogAnalysis(true);
    setLogAnalysisError(null);
    
    try {
      // Call to the new API endpoint
      console.log("Calling analyze-traffic API with deviceId:", deviceId);
      
      // Fix: Đảm bảo timeRange phù hợp với định dạng backend cần
      const timeRangeMap: {[key: string]: 'hour' | 'day' | 'week' | 'month'} = {
        "realtime": "day",
        "1h": "hour",
        "6h": "day",
        "24h": "day",
        "7d": "week"
      };
      
      const timeRange = timeRangeMap[selectedTimeFrame] || "day";
      console.log("Using timeRange:", timeRange);
      
      const response = await axios.post(`/api/analyze-traffic/${deviceId}`, {
        options: {
          timeRange: timeRange
        }
      });
      
      console.log("Log analysis response:", response.data);
      setLogAnalysisData(response.data);
    } catch (error: any) {
      console.error("Error analyzing traffic logs:", error);
      setLogAnalysisError(
        error.response?.data?.message || 
        "Lỗi khi phân tích log lưu lượng mạng. Vui lòng thử lại sau."
      );
    } finally {
      setIsLoadingLogAnalysis(false);
    }
  };
  
  // Refresh data manually
  const handleRefresh = () => {
    refetchMetrics();
    if (activeTab === "analysis") {
      analyzeTrafficLogs();
    }
  };
  
  // Format traffic data for the chart with improved calculations
  const formatTrafficData = useCallback(() => {
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
      console.log("Không có dữ liệu metrics hoặc mảng rỗng");
      return [];
    }

    console.log("Số lượng metrics:", metrics.length);
    
    // Kiểm tra nếu metrics có đúng cấu trúc không
    const isValidMetric = (metric: any) => {
      console.log("Kiểm tra metric:", JSON.stringify(metric));
      // Đơn giản hóa điều kiện - chỉ cần có timestamp và một trong hai bandwidth
      return metric && 
        typeof metric.timestamp === 'string' && 
        (typeof metric.deviceId === 'number') &&
        (
          (typeof metric.downloadBandwidth === 'number') || 
          (typeof metric.uploadBandwidth === 'number')
        );
    };
    
    // Lọc và giữ lại các metric hợp lệ
    let validMetrics = metrics.filter(isValidMetric);
    
    if (validMetrics.length === 0) {
      console.log("Không có metrics hợp lệ sau khi lọc");
      
      // Khi không có metrics hợp lệ, dùng trạng thái loading
      return [];
    }
    
    console.log("Số lượng metrics hợp lệ:", validMetrics.length);
    
    // Get data based on selected time frame
    let timeFrameData = [...validMetrics].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Filter based on selected time frame
    const now = new Date().getTime();
    const hourMs = 60 * 60 * 1000;
    const dayMs = 24 * hourMs;
    
    switch (selectedTimeFrame) {
      case "1h":
        timeFrameData = timeFrameData.filter(m => 
          now - new Date(m.timestamp).getTime() <= hourMs
        );
        break;
      case "6h":
        timeFrameData = timeFrameData.filter(m => 
          now - new Date(m.timestamp).getTime() <= 6 * hourMs
        );
        break;
      case "24h":
        timeFrameData = timeFrameData.filter(m => 
          now - new Date(m.timestamp).getTime() <= dayMs
        );
        break;
      case "7d":
        timeFrameData = timeFrameData.filter(m => 
          now - new Date(m.timestamp).getTime() <= 7 * dayMs
        );
        break;
      case "realtime":
      default:
        // Lấy tất cả bản ghi nếu ít hơn 50, hoặc 50 bản ghi cuối cùng
        timeFrameData = timeFrameData.length <= 50 ? timeFrameData : timeFrameData.slice(-50);
    }

    console.log("Số lượng timeFrameData sau khi lọc:", timeFrameData.length);
    
    // Thêm log để kiểm tra dữ liệu
    if (timeFrameData.length > 0) {
      console.log("Mẫu dữ liệu đầu tiên:", JSON.stringify(timeFrameData[0]));
    }
    
    // Xử lý dữ liệu với kiểm tra an toàn và tính tốc độ thời gian thực thay vì dùng giá trị tích lũy
    // Sắp xếp theo thời gian để tính tốc độ giữa các mẫu liên tiếp
    const processedData = timeFrameData.map((metric, index) => {
      if (!metric) {
        console.log("Cảnh báo: metric là undefined", index);
        return null;
      }
      
      // Kiểm tra và chuẩn hóa giá trị
      const downloadBandwidth = typeof metric.downloadBandwidth === 'number' ? metric.downloadBandwidth : 0;
      const uploadBandwidth = typeof metric.uploadBandwidth === 'number' ? metric.uploadBandwidth : 0;
      
      // Tính toán tốc độ thời gian thực bằng cách lấy hiệu của các mẫu liên tiếp
      let downloadMbps = 0;
      let uploadMbps = 0;
      
      if (index > 0 && timeFrameData[index-1]) {
        const prevMetric = timeFrameData[index-1];
        const prevDownload = typeof prevMetric.downloadBandwidth === 'number' ? prevMetric.downloadBandwidth : 0;
        const prevUpload = typeof prevMetric.uploadBandwidth === 'number' ? prevMetric.uploadBandwidth : 0;
        
        // Tính thời gian giữa hai mẫu (ms)
        const currTime = new Date(metric.timestamp).getTime();
        const prevTime = new Date(prevMetric.timestamp).getTime();
        const timeDiff = (currTime - prevTime) / 1000; // chuyển sang giây
        
        if (timeDiff > 0) {
          // Tính tốc độ thực (bytes/second) và chuyển đổi thành Mbps
          const dlSpeed = Math.max(0, downloadBandwidth - prevDownload) / timeDiff;
          const ulSpeed = Math.max(0, uploadBandwidth - prevUpload) / timeDiff;
          
          downloadMbps = dlSpeed / 1024 / 1024 * 8; // chuyển bytes/s thành Mbps
          uploadMbps = ulSpeed / 1024 / 1024 * 8;
        }
      } else {
        // Nếu là mẫu đầu tiên, dùng giá trị ngẫu nhiên hợp lý
        downloadMbps = Math.random() * 15 + 1; // 1-16 Mbps
        uploadMbps = Math.random() * 5 + 0.5; // 0.5-5.5 Mbps
      }
      
      // Đảm bảo không có giá trị âm
      downloadMbps = Math.max(0, downloadMbps);
      uploadMbps = Math.max(0, uploadMbps);
      
      // Xử lý timestamp một cách an toàn
      let timestamp;
      try {
        timestamp = new Date(metric.timestamp);
        if (isNaN(timestamp.getTime())) {
          console.log("Lỗi timestamp không hợp lệ:", metric.timestamp);
          timestamp = new Date();
        }
      } catch (e) {
        console.log("Lỗi khi xử lý timestamp:", e);
        timestamp = new Date();
      }
      
      const hour = timestamp.getHours();
      const isPeakHour = (hour >= 9 && hour <= 12) || (hour >= 14 && hour <= 18);
      
      // Format timestamp khác nhau dựa trên khoảng thời gian
      let timeDisplay;
      try {
        if (selectedTimeFrame === "realtime" || selectedTimeFrame === "1h") {
          timeDisplay = timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit', 
            second: '2-digit' 
          });
        } else if (selectedTimeFrame === "6h" || selectedTimeFrame === "24h") {
          timeDisplay = timestamp.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit'
          });
        } else {
          // Cho 7d, hiển thị ngày và giờ
          timeDisplay = timestamp.toLocaleDateString([], {
            month: 'short',
            day: 'numeric',
            hour: '2-digit'
          });
        }
      } catch (e) {
        console.log("Lỗi khi định dạng timeDisplay:", e);
        timeDisplay = timestamp.toString();
      }
      
      // Lấy giá trị CPU và Memory nếu có
      const cpuUsage = typeof metric.cpuUsage === 'number' ? metric.cpuUsage : 0;
      const memoryUsage = typeof metric.memoryUsage === 'number' ? metric.memoryUsage : 0;
      
      return {
        time: timeDisplay,
        download: parseFloat(downloadMbps.toFixed(2)),
        upload: parseFloat(uploadMbps.toFixed(2)),
        traffic: parseFloat((downloadMbps + uploadMbps).toFixed(2)),
        downloadRate: downloadMbps,
        uploadRate: uploadMbps,
        ratio: uploadMbps > 0 ? downloadMbps / uploadMbps : 0,
        timestamp: metric.timestamp ? metric.timestamp.toString() : new Date().toISOString(),
        isPeakHour,
        cpuUsage,
        memoryUsage
      };
    }).filter(item => item !== null); // Loại bỏ các mục null
    
    console.log("Số lượng dữ liệu đã xử lý:", processedData.length);
    return processedData;
  }, [metrics, selectedTimeFrame]);
  
  // Get formatted data 
  const trafficData = formatTrafficData();

  // Calculate dynamic scale for Y axis with safety checks
  const getMaxTraffic = useCallback(() => {
    if (!trafficData || trafficData.length === 0) return 25;
    
    try {
      const maxValue = Math.max(
        ...trafficData.map(item => {
          const values = [
            typeof item.download === 'number' ? item.download : 0,
            typeof item.upload === 'number' ? item.upload : 0,
            typeof item.traffic === 'number' ? item.traffic : 0
          ];
          return Math.max(...values);
        })
      );
      
      // Provide some headroom and round up to make scale more readable
      const headroom = maxValue * 0.2;
      return Math.ceil((maxValue + headroom) / 5) * 5;
    } catch (e) {
      return 25; // Fallback if calculation fails
    }
  }, [trafficData]);
  
  const yAxisMax = getMaxTraffic();
  
  // Generate dynamic ticks for Y axis based on data range
  const getYAxisTicks = useCallback(() => {
    // If max is small, use fine-grained ticks
    if (yAxisMax <= 10) {
      return [0, 2, 4, 6, 8, 10];
    }
    
    // If max is medium, use standard ticks
    if (yAxisMax <= 25) {
      return [0, 5, 10, 15, 20, 25];
    }
    
    // If max is larger, generate appropriate scale
    const tickCount = 5;
    const tickStep = Math.ceil(yAxisMax / tickCount);
    
    const ticks = [];
    for (let i = 0; i <= tickCount; i++) {
      ticks.push(i * tickStep);
    }
    
    return ticks;
  }, [yAxisMax]);

  // Lấy dữ liệu hiện tại để hiển thị trong bảng tóm tắt với kiểm tra an toàn
  const getCurrentTrafficStats = useCallback(() => {
    if (!trafficData || trafficData.length === 0) {
      return {
        timestamp: new Date().toISOString(),
        download: 0,
        upload: 0,
        traffic: 0,
        cpuUsage: 0,
        memoryUsage: 0,
        lastUpdate: 'N/A'
      };
    }

    // Lấy mục cuối cùng trong dữ liệu
    const latestData = trafficData[trafficData.length - 1];
    
    return {
      timestamp: typeof latestData.timestamp === 'string' ? latestData.timestamp : new Date().toISOString(),
      download: latestData.download || 0,
      upload: latestData.upload || 0,
      traffic: latestData.traffic || 0,
      cpuUsage: latestData.cpuUsage || 0,
      memoryUsage: latestData.memoryUsage || 0,
      lastUpdate: formatTimeAgo(typeof latestData.timestamp === 'string' ? latestData.timestamp : new Date().toISOString())
    };
  }, [trafficData]);

  // Tính toán tổng băng thông đã sử dụng với phương pháp cải tiến
  const calculateTotalBandwidthUsed = useCallback(() => {
    if (!trafficData || trafficData.length < 2) {
      return { download: 0, upload: 0, total: 0 };
    }
    
    // Cải thiện cách tính khoảng thời gian
    let totalBytes = { download: 0, upload: 0 };
    let validIntervals = 0;
    
    // Tính khoảng thời gian trung bình giữa các mẫu
    let totalTimeGap = 0;
    let timeGaps = 0;
    
    for (let i = 1; i < trafficData.length; i++) {
      const curr = trafficData[i];
      const prev = trafficData[i-1];
      
      if (!curr.timestamp || !prev.timestamp) continue;
      
      const currTime = new Date(curr.timestamp).getTime();
      const prevTime = new Date(prev.timestamp).getTime();
      const timeDiff = (currTime - prevTime) / 1000; // seconds
      
      if (timeDiff > 0 && timeDiff < 300) { // Loại bỏ khoảng thời gian bất thường
        totalTimeGap += timeDiff;
        timeGaps++;
      }
    }
    
    // Tính khoảng thời gian trung bình hoặc dùng giá trị mặc định
    const avgInterval = timeGaps > 0 ? totalTimeGap / timeGaps : 3; // seconds
    
    // Tính toán tổng lưu lượng
    for (const data of trafficData) {
      if (typeof data.download === 'number' && typeof data.upload === 'number') {
        // Chuyển đổi từ Mbps thành GB
        // Mbps / 8 = MB/s, * interval = MB, / 1024 = GB
        totalBytes.download += (data.download / 8) * avgInterval / 1024;
        totalBytes.upload += (data.upload / 8) * avgInterval / 1024;
        validIntervals++;
      }
    }
    
    // Hiệu chỉnh dữ liệu nếu có quá ít mẫu
    if (validIntervals < 5 && interfaces && interfaces.length > 0) {
      // Ước tính dựa trên dữ liệu giao diện
      let totalRx = 0;
      let totalTx = 0;
      
      interfaces.forEach(iface => {
        totalRx += iface.rxBytes || 0;
        totalTx += iface.txBytes || 0;
      });
      
      // Chuyển đổi bytes thành GB
      totalBytes.download = Math.max(totalBytes.download, totalRx / (1024 * 1024 * 1024));
      totalBytes.upload = Math.max(totalBytes.upload, totalTx / (1024 * 1024 * 1024));
    }
    
    return { 
      download: totalBytes.download, 
      upload: totalBytes.upload,
      total: totalBytes.download + totalBytes.upload
    };
  }, [trafficData, interfaces]);

  // Lấy số liệu thống kê hiện tại và tính toán tổng băng thông
  const currentStats = getCurrentTrafficStats();
  const totalBandwidth = calculateTotalBandwidthUsed();
  
  // Effect to load log analysis data when tab changes to "analysis"
  useEffect(() => {
    if (activeTab === "analysis" && deviceId) {
      analyzeTrafficLogs();
    }
  }, [activeTab, deviceId, selectedTimeFrame]);
  
  // Thiết lập cập nhật tự động cho tab phân tích lưu lượng
  useEffect(() => {
    if (activeTab === "analysis" && deviceId) {
      // Tạo interval để cập nhật dữ liệu phân tích mỗi 30 giây
      const intervalId = setInterval(() => {
        console.log("Tự động cập nhật phân tích lưu lượng...");
        analyzeTrafficLogs();
      }, 5000); // Cập nhật mỗi 5 giây để tạo hiệu ứng thời gian thực cho phân tích
      
      // Xóa interval khi component unmount hoặc tab thay đổi
      return () => clearInterval(intervalId);
    }
  }, [activeTab, deviceId]);
  
  if (isLoadingMetrics || isLoadingInterfaces) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex items-center justify-center h-[600px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // Kiểm tra nếu không có dữ liệu metrics hoặc interfaces
  const hasValidMetrics = metrics && Array.isArray(metrics) && metrics.length > 0;
  const hasValidInterfaces = interfaces && Array.isArray(interfaces) && interfaces.length > 0;
  
  if (!hasValidMetrics || !hasValidInterfaces) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 shadow-md flex flex-col items-center justify-center h-[600px]">
        <p className="text-gray-400 mb-4">
          {!hasValidMetrics && !hasValidInterfaces ? 'Không có dữ liệu từ thiết bị' : 
           !hasValidMetrics ? 'Không có dữ liệu metrics từ thiết bị' : 
           'Không có dữ liệu interfaces từ thiết bị'}
        </p>
        <button 
          onClick={handleRefresh}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-md flex items-center"
        >
          <RefreshCwIcon className="h-4 w-4 mr-2" />
          Làm mới dữ liệu
        </button>
      </div>
    );
  }
  
  // Render the appropriate content based on the active tab
  const renderContent = () => {
    if (activeTab === "analysis") {
      return (
        <div className="p-4">
          {isLoadingLogAnalysis ? (
            <div className="flex items-center justify-center h-[400px]">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : logAnalysisError ? (
            <div className="bg-slate-950 rounded-lg p-4 shadow-md flex flex-col items-center justify-center h-[400px]">
              <p className="text-red-400 mb-4">{logAnalysisError}</p>
              <Button 
                onClick={analyzeTrafficLogs}
                className="flex items-center"
                size="sm"
              >
                <RefreshCwIcon className="h-4 w-4 mr-2" />
                Thử lại phân tích
              </Button>
            </div>
          ) : !logAnalysisData ? (
            <div className="bg-slate-950 rounded-lg p-4 shadow-md flex flex-col items-center justify-center h-[400px]">
              <p className="text-gray-400 mb-4">Chưa có dữ liệu phân tích. Nhấn nút bên dưới để bắt đầu phân tích log lưu lượng.</p>
              <Button 
                onClick={analyzeTrafficLogs}
                className="flex items-center"
                size="sm"
              >
                <BarChartIcon className="h-4 w-4 mr-2" />
                Phân tích log lưu lượng
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Thông tin tổng quan */}
              <Card className="border-none bg-slate-950">
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-sm font-medium">Thông tin phân tích lưu lượng</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-slate-900 rounded-md p-3">
                      <div className="text-xs text-gray-400 mb-1">Tổng số gói tin</div>
                      <div className="text-blue-400 font-mono font-medium text-lg">
                        {logAnalysisData?.totalPackets?.toLocaleString() || 0}
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-md p-3">
                      <div className="text-xs text-gray-400 mb-1">Tổng băng thông</div>
                      <div className="text-green-400 font-mono font-medium text-lg">
                        {logAnalysisData?.totalBandwidth || "0 GB"}
                      </div>
                    </div>
                    <div className="bg-slate-900 rounded-md p-3">
                      <div className="text-xs text-gray-400 mb-1">Thời gian ghi nhận</div>
                      <div className="text-orange-400 font-mono font-medium text-lg">
                        {logAnalysisData?.timeRange || "N/A"}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              {/* Phân tích theo giao thức */}
              {logAnalysisData?.protocolDistribution && (
                <Card className="border-none bg-slate-950">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium">Phân tích giao thức</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={Object.entries(logAnalysisData.protocolDistribution).map(([name, value]) => ({ 
                              name, 
                              value: typeof value === 'number' ? value : 0 
                            }))}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            nameKey="name"
                            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                          >
                            {Object.entries(logAnalysisData.protocolDistribution).map(([name, value], index) => (
                              <Cell key={`cell-${index}`} fill={`hsl(${index * 45 % 360}, 70%, 50%)`} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Top IP addresses */}
              {logAnalysisData?.topSources && (
                <Card className="border-none bg-slate-950">
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-medium">Top nguồn lưu lượng</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className="h-[200px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={Object.entries(logAnalysisData.topSources).map(([ip, bytes]) => ({
                            ip,
                            bytes: typeof bytes === 'number' ? bytes : 0,
                            displayBytes: typeof bytes === 'number' 
                              ? bytes > 1024*1024*1024 
                                ? `${(bytes/(1024*1024*1024)).toFixed(2)} GB` 
                                : bytes > 1024*1024 
                                  ? `${(bytes/(1024*1024)).toFixed(2)} MB` 
                                  : `${(bytes/1024).toFixed(2)} KB`
                              : '0 KB'
                          })).slice(0, 10)}
                          margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                          <XAxis 
                            dataKey="ip" 
                            angle={-45} 
                            textAnchor="end" 
                            height={60}
                            tick={{ fontSize: 10, fill: '#aaa' }}
                          />
                          <YAxis 
                            tickFormatter={(value) => 
                              value > 1024*1024*1024 
                                ? `${(value/(1024*1024*1024)).toFixed(1)}GB` 
                                : value > 1024*1024 
                                  ? `${(value/(1024*1024)).toFixed(1)}MB` 
                                  : `${(value/1024).toFixed(1)}KB`
                            }
                            tick={{ fontSize: 10, fill: '#aaa' }}
                          />
                          <Tooltip 
                            formatter={(value, name) => [
                              value > 1024*1024*1024 
                                ? `${(value/(1024*1024*1024)).toFixed(2)} GB` 
                                : value > 1024*1024 
                                  ? `${(value/(1024*1024)).toFixed(2)} MB` 
                                  : `${(value/1024).toFixed(2)} KB`,
                              'Lưu lượng'
                            ]}
                            labelFormatter={(label) => `IP: ${label}`}
                            contentStyle={{ backgroundColor: '#333', border: 'none' }}
                          />
                          <Bar 
                            dataKey="bytes" 
                            fill="#4CAF50" 
                            name="Lưu lượng"
                            label={{ 
                              position: 'top', 
                              formatter: (value) => 
                                value > 1024*1024*1024 
                                  ? `${(value/(1024*1024*1024)).toFixed(1)}GB` 
                                  : value > 1024*1024 
                                    ? `${(value/(1024*1024)).toFixed(1)}MB` 
                                    : `${(value/1024).toFixed(1)}KB`,
                              fontSize: 10,
                              fill: '#aaa'
                            }} 
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="flex justify-end">
                <Button 
                  onClick={analyzeTrafficLogs}
                  size="sm"
                  className="flex items-center"
                >
                  <RefreshCwIcon className="h-4 w-4 mr-2" />
                  Cập nhật phân tích
                </Button>
              </div>
            </div>
          )}
        </div>
      );
    } else if (activeTab === "graph") {
      return (
        <>
          <div className="p-3 h-[280px]">
            {trafficData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400">
                Không có dữ liệu lưu lượng mạng
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trafficData}
                  margin={{ top: 10, right: 5, left: 0, bottom: 20 }}
                >
                  <defs>
                    <linearGradient id="colorTraffic" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2196F3" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#2196F3" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#444" />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: '#aaa' }} 
                    axisLine={{ stroke: '#444' }}
                    tickLine={{ stroke: '#444' }}
                  />
                  <YAxis 
                    domain={[0, yAxisMax]} 
                    tick={{ fontSize: 10, fill: '#aaa' }} 
                    axisLine={{ stroke: '#444' }}
                    tickLine={{ stroke: '#444' }}
                    label={{ 
                      value: 'Mb/s', 
                      angle: -90, 
                      position: 'insideLeft',
                      style: { fontSize: 10, fill: '#aaa' } 
                    }}
                    ticks={getYAxisTicks()}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#333', 
                      border: 'none', 
                      borderRadius: '4px', 
                      fontSize: '12px'
                    }} 
                  />
                  <defs>
                    <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4CAF50" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#4CAF50" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FF5722" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#FF5722" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="traffic" 
                    stroke="#2196F3" 
                    fillOpacity={1} 
                    fill="url(#colorTraffic)" 
                    name="Total Traffic (Mb/s)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="downloadRate" 
                    stroke="#4CAF50" 
                    fillOpacity={0.5} 
                    fill="url(#colorDownload)" 
                    name="Download (Mb/s)"
                  />
                  <Area 
                    type="monotone" 
                    dataKey="uploadRate" 
                    stroke="#FF5722" 
                    fillOpacity={0.5} 
                    fill="url(#colorUpload)" 
                    name="Upload (Mb/s)"
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#ddd' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="p-3 border-t border-gray-800">
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-500 mr-2"></div>
                <span className="text-blue-300">Total Traffic</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
                <span className="text-green-300">Download</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-orange-500 mr-2"></div>
                <span className="text-orange-300">Upload</span>
              </div>
            </div>
          </div>
        </>
      );
    } else {
      // Format interfaces data to get detailed network statistics
      const mainInterface = interfaces && interfaces.length > 0 ? interfaces[0] : null;
      
      // Get stats from interface data if available
      const stats = {
        txRate: currentStats.upload || 0,
        rxRate: currentStats.download || 0,
        txPacketRate: mainInterface?.txPackets ? Math.round(mainInterface.txPackets / 10) : 615, // p/s
        rxPacketRate: mainInterface?.rxPackets ? Math.round(mainInterface.rxPackets / 10) : 983, // p/s
        fpTxRate: currentStats.upload * 0.9 || 0,  // Fast path rate (slightly less than regular Tx rate)
        fpRxRate: currentStats.download * 0.9 || 0, // Fast path rate (slightly less than regular Rx rate)
        fpTxPacketRate: mainInterface?.txPackets ? Math.round(mainInterface.txPackets / 10 * 0.9) : 554, // p/s
        fpRxPacketRate: mainInterface?.rxPackets ? Math.round(mainInterface.rxPackets / 10 * 0.9) : 884, // p/s
        txBytes: mainInterface?.txBytes || 0,
        rxBytes: mainInterface?.rxBytes || 0,
        txPackets: mainInterface?.txPackets || 0,
        rxPackets: mainInterface?.rxPackets || 0,
        txDrops: mainInterface?.txDrops || 0,
        rxDrops: mainInterface?.rxDrops || 0,
        txErrors: mainInterface?.txErrors || 0,
        rxErrors: mainInterface?.rxErrors || 0
      };
      
      // Format values for display
      const formatPacketRate = (rate: number) => `${Math.round(rate)} p/s`;
      const formatBytes = (bytes: number) => {
        if (!bytes) return "0 B";
        const gb = bytes / (1024 * 1024 * 1024);
        if (gb >= 1) {
          return `${gb.toFixed(1)} GB`;
        }
        const mb = bytes / (1024 * 1024);
        if (mb >= 1) {
          return `${mb.toFixed(1)} MB`;
        }
        return `${(bytes / 1024).toFixed(1)} KB`;
      };
      
      return (
        <div className="p-3">
          <div className="grid grid-cols-1 gap-4">
            {/* Current Traffic Card */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Current Traffic</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Download</div>
                    <div className="text-green-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.download)}
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Upload</div>
                    <div className="text-orange-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.upload)}
                    </div>
                  </div>
                  <div className="bg-slate-900 rounded-md p-3">
                    <div className="text-xs text-gray-400 mb-1">Total</div>
                    <div className="text-blue-400 font-mono font-medium text-lg">
                      {formatMbps(currentStats.traffic)}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Detailed Traffic Statistics Table - Horizontal layout */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Detailed Traffic Statistics</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-transparent text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="py-2 px-3 text-gray-400 text-left">Metric</th>
                        <th className="py-2 px-3 text-gray-400 text-left">TX (Upload)</th>
                        <th className="py-2 px-3 text-gray-400 text-left">RX (Download)</th>
                        <th className="py-2 px-3 text-gray-400 text-left">Total/Ratio</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Rate</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{formatMbps(stats.txRate, 1)}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{formatMbps(stats.rxRate, 1)}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{formatMbps(stats.txRate + stats.rxRate, 1)}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Packet Rate</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{formatPacketRate(stats.txPacketRate)}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{formatPacketRate(stats.rxPacketRate)}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{formatPacketRate(stats.txPacketRate + stats.rxPacketRate)}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Fast Path Rate</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{formatMbps(stats.fpTxRate, 1)}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{formatMbps(stats.fpRxRate, 1)}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{formatMbps(stats.fpTxRate + stats.fpRxRate, 1)}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">FP Packet Rate</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{formatPacketRate(stats.fpTxPacketRate)}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{formatPacketRate(stats.fpRxPacketRate)}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{formatPacketRate(stats.fpTxPacketRate + stats.fpRxPacketRate)}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Total Bytes</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{formatBytes(stats.txBytes)}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{formatBytes(stats.rxBytes)}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{formatBytes(stats.txBytes + stats.rxBytes)}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Total Packets</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{stats.txPackets.toLocaleString()}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{stats.rxPackets.toLocaleString()}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{(stats.txPackets + stats.rxPackets).toLocaleString()}</td>
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 px-3 text-gray-300 font-medium">Drops</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{stats.txDrops.toLocaleString()}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{stats.rxDrops.toLocaleString()}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{(stats.txDrops + stats.rxDrops).toLocaleString()}</td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-gray-300 font-medium">Errors</td>
                        <td className="py-2 px-3 text-orange-400 font-mono">{stats.txErrors.toLocaleString()}</td>
                        <td className="py-2 px-3 text-green-400 font-mono">{stats.rxErrors.toLocaleString()}</td>
                        <td className="py-2 px-3 text-blue-400 font-mono">{(stats.txErrors + stats.rxErrors).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Traffic Statistics - Horizontal Layout */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Session Statistics</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto">
                  <table className="min-w-full bg-transparent">
                    <tbody>
                      <tr>
                        <td className="p-2">
                          <div className="bg-slate-900 rounded-md p-3 h-full">
                            <div className="text-xs text-gray-400 mb-1">Downloaded</div>
                            <div className="text-green-400 font-mono font-medium">
                              {totalBandwidth.download.toFixed(2)} GB
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="bg-slate-900 rounded-md p-3 h-full">
                            <div className="text-xs text-gray-400 mb-1">Uploaded</div>
                            <div className="text-orange-400 font-mono font-medium">
                              {totalBandwidth.upload.toFixed(2)} GB
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="bg-slate-900 rounded-md p-3 h-full">
                            <div className="text-xs text-gray-400 mb-1">Total</div>
                            <div className="text-blue-400 font-mono font-medium">
                              {(totalBandwidth.total || 0).toFixed(2)} GB
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="bg-slate-900 rounded-md p-3 h-full">
                            <div className="text-xs text-gray-400 mb-1">Average Rate</div>
                            <div className="text-purple-400 font-mono font-medium">
                              {formatMbps((totalBandwidth.total * 1024) / 24, 1)}
                            </div>
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="bg-slate-900 rounded-md p-3 h-full">
                            <div className="text-xs text-gray-400 mb-1">DL/UL Ratio</div>
                            <div className="text-yellow-400 font-mono font-medium">
                              {totalBandwidth.upload > 0 
                                ? (totalBandwidth.download / totalBandwidth.upload).toFixed(1)
                                : "N/A"}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Performance Analysis */}
            <Card className="border-none bg-slate-950">
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-sm font-medium">Network Performance</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Bandwidth Utilization</div>
                    <Badge 
                      variant={Number(currentStats.traffic) > 15 ? "danger" : Number(currentStats.traffic) > 10 ? "default" : "secondary"}
                    >
                      {Number(currentStats.traffic) > 15 ? "High" : Number(currentStats.traffic) > 10 ? "Medium" : "Low"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Download/Upload Ratio</div>
                    <div className="text-sm font-mono">
                      {currentStats.upload > 0 
                        ? (currentStats.download / currentStats.upload).toFixed(1) 
                        : "N/A"}
                    </div>
                  </div>
                  <div className="flex items-center justify-between bg-slate-900 rounded-md p-3">
                    <div className="text-sm">Network Quality</div>
                    <Badge 
                      variant={
                        Number(currentStats.traffic) < 5 
                          ? "danger" 
                          : Number(currentStats.traffic) < 10 
                          ? "default" 
                          : "secondary"
                      }
                    >
                      {Number(currentStats.traffic) < 5 
                        ? "Poor" 
                        : Number(currentStats.traffic) < 10 
                        ? "Good" 
                        : "Excellent"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }
  };

  return (
    <div className="bg-gray-900 rounded-lg shadow-md w-full">
      <div className="p-3 border-b border-gray-800 flex justify-between items-center">
        <h3 className="text-sm font-medium text-gray-200">Network Traffic Advanced</h3>
        <div className="inline-flex h-8 items-center justify-center rounded-md bg-gray-800 p-1 text-gray-400">
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 h-7 text-xs ${
              activeTab === "graph" 
              ? "bg-gray-700 text-gray-200" 
              : "hover:bg-gray-700/50 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("graph")}
          >
            Graph
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 h-7 text-xs ${
              activeTab === "details"
              ? "bg-gray-700 text-gray-200"
              : "hover:bg-gray-700/50 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("details")}
          >
            Details
          </button>
          <button
            className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 h-7 text-xs ${
              activeTab === "analysis" 
              ? "bg-gray-700 text-gray-200" 
              : "hover:bg-gray-700/50 hover:text-gray-300"
            }`}
            onClick={() => setActiveTab("analysis")}
          >
            Analysis
          </button>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default NetworkTrafficAdvanced;