import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Metric } from "@shared/schema";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend
} from "recharts";

interface CPUMemoryChartProps {
  deviceId: number | null;
}

type TimeRange = "1H" | "24H" | "7D";

const CPUMemoryChart: React.FC<CPUMemoryChartProps> = ({ deviceId }) => {
  const [timeRange, setTimeRange] = useState<TimeRange>("1H");
  
  // Fetch metrics data
  const { data: metrics, isLoading } = useQuery<Metric[]>({ 
    queryKey: deviceId ? [`/api/devices/${deviceId}/metrics`] : ['/api/devices/metrics/none'],
    enabled: !!deviceId,
  });
  
  const formatChartData = (metrics: Metric[] | undefined) => {
    if (!metrics) return [];
    
    // Sort by timestamp ascending
    const sortedMetrics = [...metrics].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    
    // Filter based on time range
    const now = new Date();
    const filteredMetrics = sortedMetrics.filter(metric => {
      const metricTime = new Date(metric.timestamp);
      if (timeRange === "1H") {
        return now.getTime() - metricTime.getTime() <= 60 * 60 * 1000;
      } else if (timeRange === "24H") {
        return now.getTime() - metricTime.getTime() <= 24 * 60 * 60 * 1000;
      } else {
        return now.getTime() - metricTime.getTime() <= 7 * 24 * 60 * 60 * 1000;
      }
    });
    
    return filteredMetrics.map(metric => ({
      timestamp: new Date(metric.timestamp).toLocaleTimeString(),
      cpuUsage: metric.cpuUsage,
      memoryUsage: metric.totalMemory ? (metric.memoryUsage || 0) / metric.totalMemory * 100 : 0
    }));
  };
  
  const chartData = formatChartData(metrics);
  
  return (
    <div className="bg-slate-800 rounded-lg p-4 border border-slate-600">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">CPU & Memory Usage</h3>
        <div className="flex space-x-2">
          <button 
            className={`px-2 py-1 text-xs font-medium rounded ${timeRange === "1H" ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-700 hover:bg-slate-600'}`}
            onClick={() => setTimeRange("1H")}
          >
            1H
          </button>
          <button 
            className={`px-2 py-1 text-xs font-medium rounded ${timeRange === "24H" ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-700 hover:bg-slate-600'}`}
            onClick={() => setTimeRange("24H")}
          >
            24H
          </button>
          <button 
            className={`px-2 py-1 text-xs font-medium rounded ${timeRange === "7D" ? 'bg-blue-600 text-white' : 'text-slate-300 bg-slate-700 hover:bg-slate-600'}`}
            onClick={() => setTimeRange("7D")}
          >
            7D
          </button>
        </div>
      </div>
      <div className="h-[200px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="timestamp" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="cpuUsage" 
                name="CPU (%)" 
                stroke="#0078d4" 
                strokeWidth={2} 
                dot={false} 
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                dataKey="memoryUsage" 
                name="Memory (%)" 
                stroke="#009688" 
                strokeWidth={2} 
                dot={false} 
                activeDot={{ r: 6 }} 
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            Đang tải dữ liệu...
          </div>
        )}
      </div>
      <div className="flex items-center justify-center mt-3 text-sm text-slate-300">
        <div className="flex items-center mr-4">
          <div className="w-3 h-3 rounded-full bg-blue-500 mr-1"></div>
          <span>CPU</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-teal-500 mr-1"></div>
          <span>Memory</span>
        </div>
      </div>
    </div>
  );
};

export default CPUMemoryChart;
