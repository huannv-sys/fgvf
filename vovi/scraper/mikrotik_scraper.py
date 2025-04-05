import json
import argparse
import re
import sys
import requests
from bs4 import BeautifulSoup
from urllib.parse import urlparse

def get_mikrotik_device_info(model_name):
    """
    Lấy thông tin thiết bị MikroTik từ trang web chính thức dựa trên tên model
    
    Args:
        model_name (str): Tên model của thiết bị MikroTik (e.g., "RB4011", "CCR2004", "hAP ac2")
    
    Returns:
        dict: Thông tin thiết bị bao gồm mô tả, thông số kỹ thuật và liên kết
    """
    # Chuẩn hóa tên model và chuẩn bị URL
    original_model = model_name
    model_name = model_name.strip().upper()
    
    # Chuyển đổi tên model thành định dạng URL và loại bỏ ký tự đặc biệt
    url_model = original_model.strip().lower().replace(' ', '_')
    # Lưu URL với dấu cộng để thử
    url_model_with_plus = url_model
    # Loại bỏ ký tự đặc biệt cho tên URL chính
    url_model = re.sub(r'[+&?%=]', '', url_model)
    
    # Thiết lập headers để giả làm trình duyệt
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
    
    try:
        # Truy cập trực tiếp vào trang sản phẩm
        product_url = f"https://mikrotik.com/product/{url_model}"
        
        # Tạo danh sách backup URL dựa trên các quy tắc đặt tên của MikroTik
        backup_urls = []
        
        # Phổ biến các tên model RB thường được mở rộng thành các phiên bản chi tiết
        common_models = {
            "rb4011": [
                "https://mikrotik.com/product/rb4011igs_rm",
                "https://mikrotik.com/product/rb4011igs_5hacq2hnd"
            ],
            "rb750": [
                "https://mikrotik.com/product/rb750gr3",
                "https://mikrotik.com/product/RB750r2"
            ],
            "rb3011": [
                "https://mikrotik.com/product/rb3011uias_rm"
            ],
            "rb2011": [
                "https://mikrotik.com/product/rb2011uias_rm"
            ],
            "ccr1009": [
                "https://mikrotik.com/product/CCR1009-7G-1C-1S_PC",
                "https://mikrotik.com/product/CCR1009-7G-1C-1SPC",
                "https://mikrotik.com/product/CCR1009"
            ],
            "ccr1016": [
                "https://mikrotik.com/product/CCR1016-12G",
                "https://mikrotik.com/product/CCR1016"
            ],
            "ccr1036": [
                "https://mikrotik.com/product/CCR1036-8G-2S_plus",
                "https://mikrotik.com/product/CCR1036-8G-2Splus",
                "https://mikrotik.com/product/CCR1036"
            ],
            "hap": [
                "https://mikrotik.com/product/hap_ac2"
            ],
            "crs": [
                "https://mikrotik.com/product/CRS326-24G-2S_plus"
            ]
        }
        
        # Tìm và mở rộng model phổ biến
        model_lower = url_model.lower()
        for common_name, urls in common_models.items():
            if model_lower == common_name:
                print(f"Tìm thấy model phổ biến: {model_lower} khớp với {common_name}")
                backup_urls.extend(urls)
        
        # Nếu không thành công, thử thêm tiền tố "rb" cho router boards
        if not url_model.startswith("rb"):
            backup_urls.append(f"https://mikrotik.com/product/rb{url_model}")
        
        # Hầu hết các sản phẩm hAP có thể truy cập trực tiếp qua URL
        if 'hap' in url_model and not url_model.startswith('hap'):
            backup_urls.append(f"https://mikrotik.com/product/hap_{url_model.replace('hap', '')}")
        
        # Hoặc CCR cho Cloud Core Routers
        if 'ccr' in url_model and not url_model.startswith('ccr'):
            backup_urls.append(f"https://mikrotik.com/product/ccr_{url_model.replace('ccr', '')}")
            
        # Thêm biến thể đảo ngược
        if url_model.startswith('rb'):
            backup_urls.append(f"https://mikrotik.com/product/{url_model[2:]}")
            
        # Thêm URL với dấu cộng nếu khác với URL chính
        if "+" in url_model_with_plus and url_model_with_plus != url_model:
            backup_urls.append(f"https://mikrotik.com/product/{url_model_with_plus}")
            # Thêm cả URL thay thế dấu + bằng _plus
            url_with_plus_replaced = url_model_with_plus.replace("+", "_plus")
            backup_urls.append(f"https://mikrotik.com/product/{url_with_plus_replaced}")
            print(f"  Thêm URL với dấu cộng: {url_model_with_plus}")
            
        # Tạo một danh sách tất cả các URL để thử
        all_urls = [product_url] + backup_urls
        print(f"Tất cả URL thử: {all_urls}")
        success = False
        tried_urls = []
        
        # Thử lần lượt từng URL
        for url in all_urls:
            tried_urls.append(url)
            try:
                print(f"Đang thử URL: {url}")
                response = requests.get(url, headers=headers, timeout=10)
                print(f"  Kết quả: {response.status_code}")
                if response.status_code == 200:
                    # Kiểm tra nếu không có bảng thông số kỹ thuật hoặc thông số trong trang
                    temp_soup = BeautifulSoup(response.text, 'html.parser')
                    specs_tables = temp_soup.select('table.product-table, table.details-table')
                    
                    # Tìm kiếm tất cả các kiểu bảng thông số kỹ thuật có thể
                    if len(specs_tables) == 0:
                        # Kiểm tra các định dạng thông số kỹ thuật khả năng khác
                        specs_divs = temp_soup.select('.details-specs, .product-specs, .specifications, .specs-box')
                        
                        # Kiểm tra nội dung trang, tìm các từ khóa như "CPU", "RAM", "Memory"
                        page_text = temp_soup.get_text().lower()
                        has_spec_keywords = any(keyword in page_text for keyword in ['cpu:', 'ram:', 'memory:', 'storage:', 'processor:', 'architecture:'])
                        
                        if len(specs_divs) == 0 and not has_spec_keywords:
                            print(f"  URL {url} không có bảng thông số kỹ thuật, tiếp tục tìm kiếm")
                            continue
                    
                    product_url = url
                    success = True
                    print(f"  Tìm thấy URL thành công và có bảng thông số: {url}")
                    break
            except requests.RequestException as e:
                print(f"  Lỗi khi truy cập {url}: {str(e)}")
                continue
        
        # Phát sinh lỗi nếu không thành công với tất cả các URL
        if not success:
            # Chọn URL cuối cùng mà ít nhất có trạng thái 200 OK nhưng không có thông số kỹ thuật
            last_valid_url = None
            for url in all_urls:
                try:
                    response = requests.get(url, headers=headers, timeout=10)
                    if response.status_code == 200:
                        last_valid_url = url
                        break
                except:
                    continue
            
            # Nếu có ít nhất một URL hợp lệ nhưng không có thông số, trả về kết quả cơ bản
            if last_valid_url:
                print(f"  Không tìm thấy thông số kỹ thuật nhưng tìm thấy URL: {last_valid_url}")
                # Lấy thông tin cơ bản như model và mô tả
                response = requests.get(last_valid_url, headers=headers, timeout=10)
                soup = BeautifulSoup(response.text, 'html.parser')
                
                result = {
                    "model": model_name,
                    "url": last_valid_url,
                    "specifications": {},
                    "warning": "Không tìm thấy thông số kỹ thuật đầy đủ cho model này"
                }
                
                # Lấy mô tả sản phẩm nếu có
                description_element = soup.select_one('.product-description p, .product-description-text p')
                if description_element:
                    result['description'] = description_element.text.strip()
                
                return result
            
            # Nếu không có URL nào hoạt động, trả về lỗi
            result = {
                "error": f"Không tìm thấy trang sản phẩm cho model {original_model}",
                "tried_urls": tried_urls
            }
            return result
        
        # Truy cập trang sản phẩm để lấy thông tin chi tiết
        product_response = requests.get(product_url, headers=headers, timeout=10)
        product_response.raise_for_status()
        
        # Phân tích trang sản phẩm
        product_soup = BeautifulSoup(product_response.text, 'html.parser')
        
        # Chuẩn bị đối tượng kết quả
        result = {
            "model": model_name,
            "url": product_url,
            "specifications": {}
        }
        
        # Lấy phần mô tả sản phẩm
        description_element = product_soup.select_one('.product-description p, .product-description-text p')
        if description_element:
            result['description'] = description_element.text.strip()
        
        # Lấy thông số kỹ thuật từ bảng
        specs_table = product_soup.select('table.product-table tr, table.details-table tr')
        
        if specs_table:
            # Nếu có bảng thông số kỹ thuật
            for row in specs_table:
                cells = row.select('td, th')
                if len(cells) >= 2:
                    key = cells[0].text.strip()
                    value = cells[1].text.strip()
                    if key and value and key != "Details" and ":" not in key:
                        result['specifications'][key] = value
        else:
            # Tìm thông số kỹ thuật từ các định dạng khác
            specs_divs = product_soup.select('.details-specs, .product-specs, .specifications, .specs-box')
            if specs_divs:
                for div in specs_divs:
                    specs_text = div.get_text()
                    # Tìm các dòng có định dạng "key: value"
                    matches = re.findall(r'([^:\n]+):\s+([^\n]+)', specs_text)
                    for key, value in matches:
                        result['specifications'][key.strip()] = value.strip()
            
            # Nếu vẫn không tìm thấy, tìm từ nội dung trang
            if not result['specifications']:
                page_text = product_soup.get_text()
                # Tìm các dòng có định dạng "CPU: xxx" hoặc "RAM: xxx" v.v.
                specs_matches = re.findall(r'(CPU|Processor|RAM|Memory|Storage|Flash|Architecture):\s+([^\n,\.]+)', page_text, re.IGNORECASE)
                for key, value in specs_matches:
                    result['specifications'][key.strip()] = value.strip()
        
        # Trích xuất thông tin CPU
        cpu_info = None
        for key, value in result["specifications"].items():
            if 'cpu' in key.lower() or 'processor' in key.lower():
                cpu_info = value
                break
        
        if cpu_info:
            result["cpu"] = cpu_info
        
        # Trích xuất thông tin RAM
        ram_info = None
        for key, value in result["specifications"].items():
            if 'ram' in key.lower() or 'memory' in key.lower():
                ram_info = value
                break
        
        if ram_info:
            result["memory"] = ram_info
        
        # Trích xuất thông tin storage
        storage_info = None
        for key, value in result["specifications"].items():
            if 'storage' in key.lower() or 'flash' in key.lower():
                storage_info = value
                break
        
        if storage_info:
            result["storage"] = storage_info
        
        return result
    
    except requests.RequestException as e:
        return {"error": f"Lỗi khi truy cập trang web MikroTik: {str(e)}"}

def get_routeros_version_info(version=None):
    """
    Lấy thông tin về phiên bản RouterOS
    
    Args:
        version (str, optional): Phiên bản cụ thể cần tìm
    
    Returns:
        dict: Thông tin về các phiên bản RouterOS
    """
    url = "https://mikrotik.com/download"
    
    # Thiết lập headers để giả làm trình duyệt
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
    
    try:
        # Lấy nội dung HTML từ trang download
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        # Phân tích nội dung HTML với BeautifulSoup
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Phân tích nội dung để tìm thông tin phiên bản
        versions_info = {}
        
        # Tìm các phần về RouterOS trong trang tải xuống
        download_sections = soup.select('.download-section')
        
        for section in download_sections:
            # Kiểm tra xem phần này có phải RouterOS không
            heading = section.select_one('h1, h2, h3')
            if heading and 'RouterOS' in heading.text:
                # Tìm tất cả các phiên bản trong phần này
                version_elements = section.select('.download-wrapper')
                
                for element in version_elements:
                    # Tìm kiếm số phiên bản
                    version_header = element.select_one('.header')
                    if version_header and 'RouterOS' in version_header.text:
                        version_match = re.search(r'RouterOS v([\d\.]+)', version_header.text)
                        if version_match:
                            version_num = version_match.group(1).strip()
                            
                            # Tìm ngày phát hành
                            release_info = element.select_one('.download-meta')
                            release_date = "N/A"
                            if release_info:
                                date_match = re.search(r'Released on\s+(\d{4}-\d{2}-\d{2})', release_info.text)
                                if date_match:
                                    release_date = date_match.group(1).strip()
                            
                            versions_info[version_num] = {
                                "version": version_num,
                                "release_date": release_date
                            }
                            
                            # Nếu tìm thấy version cụ thể được yêu cầu
                            if version and version == version_num:
                                return {"version": version_num, "release_date": release_date}
        
        if not versions_info:
            return {"error": "Không tìm thấy thông tin phiên bản RouterOS trên trang web"}
        
        # Nếu version cụ thể được yêu cầu nhưng không tìm thấy
        if version and version not in versions_info:
            return {"error": f"Không tìm thấy thông tin cho RouterOS phiên bản {version}"}
        
        return versions_info
        
    except requests.RequestException as e:
        return {"error": f"Lỗi khi truy cập trang tải xuống MikroTik: {str(e)}"}

def main():
    parser = argparse.ArgumentParser(description='MikroTik Information Scraper')
    parser.add_argument('--model', help='Model name to search for (e.g., RB4011)')
    parser.add_argument('--routeros', help='RouterOS version to get info for (optional)')
    parser.add_argument('--output', help='Output file for JSON results (optional)')
    
    args = parser.parse_args()
    
    result = {}
    
    # Lấy thông tin thiết bị nếu được chỉ định
    if args.model:
        device_info = get_mikrotik_device_info(args.model)
        result["device"] = device_info
    
    # Lấy thông tin RouterOS nếu được chỉ định
    if args.routeros:
        routeros_info = get_routeros_version_info(args.routeros)
        result["routeros"] = routeros_info
    elif not args.model:  # Lấy tất cả phiên bản nếu không có model hoặc routeros cụ thể
        routeros_info = get_routeros_version_info()
        result["routeros_versions"] = routeros_info
    
    # Xuất kết quả
    json_result = json.dumps(result, ensure_ascii=False, indent=2)
    
    if args.output:
        with open(args.output, 'w', encoding='utf-8') as f:
            f.write(json_result)
        print(f"Đã lưu kết quả vào {args.output}")
    else:
        print(json_result)

if __name__ == "__main__":
    main()