import argparse
import ipaddress
import json
import subprocess
import platform
import requests
import time
import socket
import re
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

def check_host_up(ip, timeout=1):
    """
    Kiểm tra xem một host có hoạt động không bằng cách sử dụng ping
    
    Args:
        ip (str): Địa chỉ IP cần kiểm tra
        timeout (int): Thời gian chờ kết nối (giây)
    
    Returns:
        bool: True nếu host đang hoạt động, ngược lại là False
    """
    # Kiểm tra hệ điều hành để sử dụng lệnh ping phù hợp
    param = '-n' if platform.system().lower() == 'windows' else '-c'
    timeout_param = f'-w {timeout * 1000}' if platform.system().lower() == 'windows' else f'-W {timeout}'
    
    # Thực hiện lệnh ping
    try:
        result = subprocess.run(
            ['ping', param, '1', timeout_param, ip],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=timeout + 1  # Chờ lâu hơn một chút so với timeout của lệnh ping
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, subprocess.TimeoutExpired):
        return False

def scan_port(ip, port, timeout=0.5):
    """
    Kiểm tra xem một cổng trên một địa chỉ IP có mở không
    
    Args:
        ip (str): Địa chỉ IP cần kiểm tra
        port (int): Cổng cần kiểm tra
        timeout (float): Thời gian chờ kết nối (giây)
    
    Returns:
        bool: True nếu cổng mở, ngược lại là False
    """
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        result = sock.connect_ex((ip, port))
        return result == 0
    except (socket.timeout, ConnectionRefusedError, OSError):
        return False
    finally:
        sock.close()

def get_device_hostname(ip):
    """
    Thử lấy tên của thiết bị từ DNS
    
    Args:
        ip (str): Địa chỉ IP cần tìm tên
    
    Returns:
        str: Tên của thiết bị hoặc None nếu không tìm thấy
    """
    try:
        hostname, _, _ = socket.gethostbyaddr(ip)
        return hostname
    except (socket.herror, socket.gaierror):
        return None

def check_mikrotik_api(ip, username='admin', password='', timeout=2):
    """
    Kiểm tra xem một thiết bị có phải là MikroTik RouterOS và có API mở không
    
    Args:
        ip (str): Địa chỉ IP cần kiểm tra
        username (str): Tên đăng nhập (mặc định là 'admin')
        password (str): Mật khẩu (mặc định là rỗng)
        timeout (int): Thời gian chờ kết nối (giây)
    
    Returns:
        dict: Thông tin về thiết bị MikroTik hoặc None nếu không phải
    """
    # Kiểm tra cổng API chuẩn của MikroTik
    mikrotik_api_ports = [8728, 8729]  # 8728 là API không mã hóa, 8729 là API mã hóa
    
    for port in mikrotik_api_ports:
        if scan_port(ip, port, timeout):
            return {
                "ip": ip,
                "api_port": port,
                "is_mikrotik": True,
                "description": f"MikroTik RouterOS API (Port {port})"
            }
    
    # Kiểm tra cổng WebFig/QuickSet (HTTP/HTTPS)
    web_ports = [80, 443]
    
    for port in web_ports:
        if scan_port(ip, port, timeout):
            try:
                protocol = "https" if port == 443 else "http"
                url = f"{protocol}://{ip}"
                response = requests.get(url, timeout=timeout, verify=False, allow_redirects=True)
                
                # Kiểm tra tiêu đề hoặc nội dung trang để xác định RouterOS WebFig
                if "mikrotik" in response.text.lower() or "routeros" in response.text.lower():
                    return {
                        "ip": ip,
                        "web_port": port,
                        "is_mikrotik": True,
                        "description": f"MikroTik RouterOS Web Interface (Port {port})"
                    }
                
                # Kiểm tra header Server
                server = response.headers.get('Server', '')
                if 'mikrotik' in server.lower() or 'routeros' in server.lower():
                    return {
                        "ip": ip,
                        "web_port": port,
                        "is_mikrotik": True,
                        "description": f"MikroTik RouterOS Web Interface (Port {port})"
                    }
            except requests.RequestException:
                pass
    
    return None

def scan_network(network, concurrent=20):
    """
    Quét một dải mạng để tìm thiết bị MikroTik
    
    Args:
        network (str): Dải mạng theo định dạng CIDR (ví dụ: '192.168.1.0/24')
        concurrent (int): Số lượng quá trình đồng thời tối đa
    
    Returns:
        list: Danh sách các thiết bị MikroTik được tìm thấy
    """
    # Phân tích dải mạng
    try:
        ip_network = ipaddress.ip_network(network, strict=False)
    except ValueError as e:
        print(f"Lỗi: {e}")
        return []
    
    # Danh sách kết quả
    results = []
    active_hosts = []
    
    # Đầu tiên là quét ping để tìm các host đang hoạt động
    print(f"Đang quét ping dải mạng {network} để tìm các host đang hoạt động...")
    
    with ThreadPoolExecutor(max_workers=concurrent) as executor:
        future_to_ip = {executor.submit(check_host_up, str(ip)): ip for ip in ip_network.hosts()}
        
        for i, future in enumerate(as_completed(future_to_ip)):
            ip = future_to_ip[future]
            try:
                is_up = future.result()
                if is_up:
                    active_hosts.append(str(ip))
                    print(f"Host {ip} đang hoạt động ({len(active_hosts)} hosts được tìm thấy)")
            except Exception as e:
                print(f"Lỗi khi kiểm tra {ip}: {e}")
            
            # Hiển thị tiến trình
            if (i + 1) % 10 == 0 or i + 1 == len(future_to_ip):
                total = len(future_to_ip)
                print(f"Đã quét {i + 1}/{total} hosts ({(i + 1) / total * 100:.1f}%)")
    
    # Tiếp theo là kiểm tra từng host đang hoạt động để xem có phải MikroTik không
    print(f"\nĐã tìm thấy {len(active_hosts)} hosts đang hoạt động. Đang kiểm tra thiết bị MikroTik...")
    
    with ThreadPoolExecutor(max_workers=concurrent) as executor:
        future_to_ip = {executor.submit(check_mikrotik_api, ip): ip for ip in active_hosts}
        
        for i, future in enumerate(as_completed(future_to_ip)):
            ip = future_to_ip[future]
            try:
                mikrotik_info = future.result()
                if mikrotik_info:
                    # Thêm tên host nếu có
                    hostname = get_device_hostname(ip)
                    if hostname:
                        mikrotik_info["hostname"] = hostname
                    
                    results.append(mikrotik_info)
                    print(f"Tìm thấy thiết bị MikroTik tại {ip}")
            except Exception as e:
                print(f"Lỗi khi kiểm tra {ip}: {e}")
            
            # Hiển thị tiến trình
            if (i + 1) % 5 == 0 or i + 1 == len(future_to_ip):
                total = len(future_to_ip)
                print(f"Đã kiểm tra {i + 1}/{total} hosts đang hoạt động ({(i + 1) / total * 100:.1f}%)")
    
    return results

def scan_multiple_networks(networks, concurrent=20):
    """
    Quét nhiều dải mạng để tìm thiết bị MikroTik
    
    Args:
        networks (list): Danh sách các dải mạng theo định dạng CIDR
        concurrent (int): Số lượng quá trình đồng thời tối đa
    
    Returns:
        list: Danh sách các thiết bị MikroTik được tìm thấy
    """
    all_results = []
    
    for network in networks:
        print(f"\nĐang quét dải mạng {network}...")
        results = scan_network(network, concurrent)
        all_results.extend(results)
        print(f"Tìm thấy {len(results)} thiết bị MikroTik trong dải mạng {network}")
    
    return all_results

def get_local_networks():
    """
    Tự động phát hiện dải mạng cục bộ
    
    Returns:
        list: Danh sách các dải mạng cục bộ theo định dạng CIDR
    """
    networks = []
    
    try:
        # Lấy các interface mạng
        if platform.system() == "Windows":
            # Sử dụng ipconfig trên Windows
            output = subprocess.check_output(["ipconfig", "/all"], text=True, encoding='utf-8')
            
            # Tìm các dòng có địa chỉ IP và subnet mask
            ip_pattern = r"IPv4 Address[.\s]+: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)"
            mask_pattern = r"Subnet Mask[.\s]+: ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)"
            
            ips = re.findall(ip_pattern, output)
            masks = re.findall(mask_pattern, output)
            
            # Ghép cặp địa chỉ IP và subnet mask
            for i in range(min(len(ips), len(masks))):
                try:
                    # Chuyển đổi subnet mask thành prefix length
                    mask_int = sum([bin(int(x)).count('1') for x in masks[i].split('.')])
                    # Tạo dải mạng
                    ip = ipaddress.ip_address(ips[i])
                    network = ipaddress.ip_network(f"{ip}/{mask_int}", strict=False)
                    networks.append(str(network))
                except (ValueError, ipaddress.AddressValueError):
                    continue
                
        else:
            # Sử dụng ip trên Linux/macOS
            try:
                output = subprocess.check_output(["ip", "-o", "-f", "inet", "addr", "show"], text=True, encoding='utf-8')
            except:
                # Fallback to ifconfig if ip command is not available
                output = subprocess.check_output(["ifconfig"], text=True, encoding='utf-8')
            
            # Tìm các dòng có định dạng CIDR
            cidr_pattern = r"inet ([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/[0-9]+)"
            networks = re.findall(cidr_pattern, output)
    except Exception as e:
        print(f"Lỗi khi phát hiện dải mạng cục bộ: {e}")
    
    # Lọc bỏ các mạng không hợp lệ hoặc không phải mạng cục bộ
    valid_networks = []
    for net in networks:
        try:
            if '/' not in net:
                continue
            
            network = ipaddress.ip_network(net, strict=False)
            
            # Kiểm tra nếu là mạng cục bộ
            if network.is_private and not network.is_loopback:
                valid_networks.append(str(network))
        except (ValueError, ipaddress.AddressValueError):
            continue
    
    return valid_networks

def main():
    parser = argparse.ArgumentParser(description='MikroTik Network Scanner')
    parser.add_argument('--networks', nargs='+', help='Danh sách các dải mạng cần quét (ví dụ: 192.168.1.0/24 10.0.0.0/16)')
    parser.add_argument('--auto', action='store_true', help='Tự động phát hiện dải mạng cục bộ')
    parser.add_argument('--output', help='File để lưu kết quả dưới dạng JSON')
    parser.add_argument('--concurrent', type=int, default=20, help='Số lượng quá trình đồng thời tối đa (mặc định: 20)')
    
    args = parser.parse_args()
    
    # Xác định dải mạng cần quét
    networks_to_scan = []
    
    if args.auto:
        print("Đang tự động phát hiện dải mạng cục bộ...")
        detected_networks = get_local_networks()
        
        if detected_networks:
            print(f"Đã phát hiện {len(detected_networks)} dải mạng: {', '.join(detected_networks)}")
            networks_to_scan.extend(detected_networks)
        else:
            print("Không phát hiện được dải mạng cục bộ nào.")
    
    if args.networks:
        print(f"Đã chỉ định {len(args.networks)} dải mạng: {', '.join(args.networks)}")
        networks_to_scan.extend(args.networks)
    
    if not networks_to_scan:
        print("Không có dải mạng nào để quét. Hãy sử dụng --networks hoặc --auto.")
        parser.print_help()
        return
    
    # Bắt đầu quét
    start_time = time.time()
    print(f"Bắt đầu quét {len(networks_to_scan)} dải mạng...")
    
    results = scan_multiple_networks(networks_to_scan, args.concurrent)
    
    # Hiển thị kết quả
    end_time = time.time()
    duration = end_time - start_time
    
    print(f"\nĐã hoàn thành quét trong {duration:.2f} giây.")
    print(f"Tìm thấy {len(results)} thiết bị MikroTik:")
    
    for i, device in enumerate(results, 1):
        hostname = device.get("hostname", "N/A")
        ip = device["ip"]
        desc = device["description"]
        print(f"{i}. {hostname} ({ip}) - {desc}")
    
    # Lưu kết quả nếu có yêu cầu
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2, ensure_ascii=False)
        print(f"\nĐã lưu kết quả vào {args.output}")

if __name__ == "__main__":
    main()