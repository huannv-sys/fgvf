import pandas as pd
import numpy as np
import re
from datetime import datetime
import io
import csv
import logging

def parse_mikrotik_logs(log_content):
    """
    Parse Mikrotik log file content and convert it to a pandas DataFrame.
    Handles various common Mikrotik log formats.
    
    Args:
        log_content (str): The content of the log file
        
    Returns:
        pandas.DataFrame: Processed DataFrame with structured data
    """
    # Try to determine the log format
    lines = log_content.strip().split('\n')
    
    # Skip empty lines and comments
    lines = [line for line in lines if line.strip() and not line.strip().startswith('#')]
    
    if not lines:
        logging.error("No valid data found in the log file")
        return None
    
    # Check for CSV format first
    try:
        df = pd.read_csv(io.StringIO(log_content))
        logging.info("Successfully parsed as CSV format")
        
        # Convert timestamp column if it exists
        if 'timestamp' in df.columns:
            df['timestamp'] = pd.to_datetime(df['timestamp'], errors='coerce')
        elif 'time' in df.columns:
            df['timestamp'] = pd.to_datetime(df['time'], errors='coerce')
            df = df.drop(columns=['time'])
        
        return df
    except Exception as e:
        logging.debug(f"Not a CSV format: {str(e)}")
    
    # Try parsing common Mikrotik log format (key=value pairs)
    try:
        data = []
        
        # Common patterns for timestamps
        timestamp_patterns = [
            r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})',  # 2023-10-05 08:23:45
            r'(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})',     # Oct  5 08:23:45
            r'(\d{1,2}/\d{1,2}/\d{4}\s+\d{2}:\d{2}:\d{2})' # 10/5/2023 08:23:45
        ]
        
        # Regex for key-value pairs
        kv_pattern = r'([a-zA-Z0-9_-]+)=([^"\s]+|"[^"]*")'
        
        for line in lines:
            line_data = {}
            
            # Try to extract timestamp
            timestamp = None
            for pattern in timestamp_patterns:
                match = re.search(pattern, line)
                if match:
                    try:
                        timestamp_str = match.group(1)
                        # Try different timestamp formats
                        for fmt in [
                            '%Y-%m-%d %H:%M:%S',
                            '%b %d %H:%M:%S',
                            '%m/%d/%Y %H:%M:%S'
                        ]:
                            try:
                                timestamp = datetime.strptime(timestamp_str, fmt)
                                break
                            except ValueError:
                                continue
                    except Exception as e:
                        logging.debug(f"Timestamp parsing error: {str(e)}")
                    break
            
            if timestamp:
                line_data['timestamp'] = timestamp
            
            # Extract key-value pairs
            for key, value in re.findall(kv_pattern, line):
                # Remove quotes if present
                if value.startswith('"') and value.endswith('"'):
                    value = value[1:-1]
                line_data[key.lower().replace('-', '_')] = value
            
            # Only add if we found some data
            if line_data:
                data.append(line_data)
        
        if data:
            df = pd.DataFrame(data)
            logging.info(f"Successfully parsed key-value format, found {len(df)} records")
            
            # Convert bytes to numeric if present
            if 'bytes' in df.columns:
                df['bytes'] = pd.to_numeric(df['bytes'], errors='coerce')
            
            # Convert port numbers to numeric if present
            for port_col in ['src_port', 'dst_port', 'source_port', 'destination_port']:
                if port_col in df.columns:
                    df[port_col] = pd.to_numeric(df[port_col], errors='coerce')
            
            # Standardize column names
            col_mapping = {
                'source_ip': 'src_ip',
                'destination_ip': 'dst_ip',
                'source_port': 'src_port',
                'destination_port': 'dst_port'
            }
            
            for old_col, new_col in col_mapping.items():
                if old_col in df.columns and new_col not in df.columns:
                    df[new_col] = df[old_col]
                    df = df.drop(columns=[old_col])
            
            return df
        else:
            logging.error("Failed to parse key-value format")
    except Exception as e:
        logging.error(f"Error parsing key-value format: {str(e)}")
    
    # Try space or tab delimited format
    try:
        # Try to identify columns based on the first few lines
        potential_headers = set()
        for line in lines[:10]:  # Check first 10 lines
            # Split by multiple spaces or tabs
            parts = re.split(r'\s+', line.strip())
            for part in parts:
                # Look for potential header names
                if re.match(r'^[a-zA-Z][a-zA-Z0-9_-]*$', part):
                    potential_headers.add(part.lower())
        
        # If we found potential headers
        if potential_headers:
            # Try to parse the whole file with these columns
            data = []
            for line in lines:
                line_data = {}
                parts = re.split(r'\s+', line.strip())
                
                # Try to extract timestamp first (usually first few fields)
                timestamp_str = ' '.join(parts[:2])  # Assume first 2 fields might be date and time
                try:
                    timestamp = pd.to_datetime(timestamp_str, errors='raise')
                    line_data['timestamp'] = timestamp
                    parts = parts[2:]  # Remove used timestamp parts
                except:
                    # If it's not a timestamp, continue with all parts
                    pass
                
                # Process the rest as key-value pairs if possible
                for i in range(0, len(parts) - 1, 2):
                    if i+1 < len(parts):
                        key = parts[i].lower().replace('-', '_').strip(':')
                        value = parts[i+1]
                        line_data[key] = value
                
                if line_data:
                    data.append(line_data)
            
            if data:
                df = pd.DataFrame(data)
                logging.info(f"Successfully parsed space-delimited format, found {len(df)} records")
                
                # Convert numeric columns
                for col in df.columns:
                    if col in ['bytes', 'src_port', 'dst_port']:
                        df[col] = pd.to_numeric(df[col], errors='coerce')
                
                return df
    except Exception as e:
        logging.error(f"Error parsing space-delimited format: {str(e)}")
    
    # If all parsing methods fail
    logging.error("Could not determine the log format")
    return None


def process_traffic_data(df):
    """
    Process the traffic data for analysis and visualization.
    
    Args:
        df (pandas.DataFrame): DataFrame with log data
        
    Returns:
        dict: Dictionary with computed statistics
    """
    stats = {}
    
    # Basic statistics
    stats['total_records'] = len(df)
    
    if 'bytes' in df.columns:
        total_bytes = df['bytes'].sum()
        stats['total_bytes'] = total_bytes
        stats['total_mb'] = total_bytes / (1024**2)
        stats['total_gb'] = total_bytes / (1024**3)
        
        # Average traffic per record
        stats['avg_bytes_per_record'] = df['bytes'].mean()
    
    # IP statistics
    if 'src_ip' in df.columns:
        stats['unique_sources'] = df['src_ip'].nunique()
        stats['top_sources'] = df.groupby('src_ip').size().sort_values(ascending=False).head(10)
        
        if 'bytes' in df.columns:
            stats['top_sources_by_traffic'] = df.groupby('src_ip')['bytes'].sum().sort_values(ascending=False).head(10)
    
    if 'dst_ip' in df.columns:
        stats['unique_destinations'] = df['dst_ip'].nunique()
        stats['top_destinations'] = df.groupby('dst_ip').size().sort_values(ascending=False).head(10)
        
        if 'bytes' in df.columns:
            stats['top_destinations_by_traffic'] = df.groupby('dst_ip')['bytes'].sum().sort_values(ascending=False).head(10)
    
    # Protocol statistics
    if 'protocol' in df.columns:
        stats['protocol_distribution'] = df['protocol'].value_counts()
    
    # Time-based statistics
    if 'timestamp' in df.columns:
        stats['timespan'] = {
            'start': df['timestamp'].min(),
            'end': df['timestamp'].max(),
            'duration_hours': (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 3600
        }
        
        # Traffic by hour of day
        df['hour'] = df['timestamp'].dt.hour
        
        if 'bytes' in df.columns:
            stats['traffic_by_hour'] = df.groupby('hour')['bytes'].sum()
        
        stats['connections_by_hour'] = df.groupby('hour').size()
        
        # Traffic by day of week
        df['day_of_week'] = df['timestamp'].dt.day_name()
        
        if 'bytes' in df.columns:
            stats['traffic_by_day'] = df.groupby('day_of_week')['bytes'].sum()
        
        stats['connections_by_day'] = df.groupby('day_of_week').size()
    
    # Port statistics
    if 'dst_port' in df.columns:
        stats['top_destination_ports'] = df.groupby('dst_port').size().sort_values(ascending=False).head(10)
        
        if 'bytes' in df.columns:
            stats['top_ports_by_traffic'] = df.groupby('dst_port')['bytes'].sum().sort_values(ascending=False).head(10)
    
    return stats
