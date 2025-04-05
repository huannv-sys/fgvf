import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { CapsmanClient } from '@shared/schema';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { InfoIcon, SignalIcon, WifiIcon, UserIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ClientsListProps {
  apId: number | null;
  apName?: string;
}

export default function ClientsList({ apId, apName }: ClientsListProps) {
  const [expandedClientId, setExpandedClientId] = useState<number | null>(null);

  const { data: clients, isLoading } = useQuery<any[]>({
    queryKey: ['/api/capsman', apId, 'clients'],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/capsman/${apId}/clients`);
      return res.json();
    },
    enabled: !!apId,
  });

  const getSignalIndicator = (signalStrength: number | null) => {
    if (signalStrength === null) return 0;
    
    if (signalStrength > -50) return 4;
    if (signalStrength > -60) return 3;
    if (signalStrength > -70) return 2;
    if (signalStrength > -80) return 1;
    return 0;
  };

  const getSignalColor = (signalStrength: number | null) => {
    if (signalStrength === null) return 'text-gray-400';
    
    if (signalStrength > -50) return 'text-green-500';
    if (signalStrength > -60) return 'text-green-400';
    if (signalStrength > -70) return 'text-yellow-400';
    if (signalStrength > -80) return 'text-orange-400';
    return 'text-red-500';
  };

  const renderSignalIcons = (signalStrength: number | null) => {
    const bars = getSignalIndicator(signalStrength);
    const color = getSignalColor(signalStrength);
    
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`h-${level + 1} w-1 rounded-sm ${level <= bars ? color : 'bg-gray-200 dark:bg-gray-700'}`}
          />
        ))}
      </div>
    );
  };

  const toggleClientExpanded = (clientId: number) => {
    setExpandedClientId(expandedClientId === clientId ? null : clientId);
  };

  if (isLoading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiIcon className="h-4 w-4" />
            Đang tải danh sách người dùng...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="space-y-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!clients || clients.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WifiIcon className="h-4 w-4" />
            {apName ? `Người dùng kết nối - ${apName}` : 'Người dùng kết nối'}
          </CardTitle>
          <CardDescription>
            Không có người dùng nào kết nối với điểm truy cập này
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <WifiIcon className="h-4 w-4" />
          {apName ? `Người dùng kết nối - ${apName}` : 'Người dùng kết nối'}
        </CardTitle>
        <CardDescription>
          {clients.length} người dùng đang kết nối
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tên/IP</TableHead>
              <TableHead>Kết nối</TableHead>
              <TableHead>Tín hiệu</TableHead>
              <TableHead>Thời gian</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clients.map((client) => (
              <TableRow key={client.id}>
                <TableCell className="font-medium flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-blue-500" />
                  <div>
                    <div>{client.hostname || 'Không xác định'}</div>
                    <div className="text-xs text-muted-foreground">{client.ipAddress || 'Không xác định'}</div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-blue-500/10 text-blue-500">
                      {client.interface || 'wlan0'}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <SignalIcon className={`h-4 w-4 ${getSignalColor(client.signalStrength)}`} />
                    <span>{client.signalStrength || 'N/A'} dBm</span>
                  </div>
                </TableCell>
                <TableCell>
                  {client.connectedTime || 'Không xác định'}
                </TableCell>
                <TableCell className="text-right">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <InfoIcon className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="grid gap-4">
                        <div className="space-y-2">
                          <h4 className="font-medium leading-none">Chi tiết kết nối</h4>
                          <p className="text-sm text-muted-foreground">
                            Thông tin chi tiết về thiết bị đang kết nối
                          </p>
                        </div>
                        <div className="grid gap-2">
                          <div className="grid grid-cols-3 items-center gap-4">
                            <span className="text-sm">MAC Address:</span>
                            <span className="col-span-2 text-sm font-medium">{client.macAddress}</span>
                          </div>
                          <div className="grid grid-cols-3 items-center gap-4">
                            <span className="text-sm">Tốc độ TX:</span>
                            <span className="col-span-2 text-sm font-medium">{client.txRate || 'Không xác định'}</span>
                          </div>
                          <div className="grid grid-cols-3 items-center gap-4">
                            <span className="text-sm">Tốc độ RX:</span>
                            <span className="col-span-2 text-sm font-medium">{client.rxRate || 'Không xác định'}</span>
                          </div>
                          <div className="grid grid-cols-3 items-center gap-4">
                            <span className="text-sm">Người dùng:</span>
                            <span className="col-span-2 text-sm font-medium">{client.username || 'Không xác định'}</span>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}