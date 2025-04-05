import streamlit as st
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import numpy as np
import io
import datetime
import csv
from modules.data_processor import parse_mikrotik_logs, process_traffic_data
from modules.visualizer import (
    create_bandwidth_chart, 
    create_connection_chart, 
    create_protocol_pie, 
    create_hourly_heatmap,
    create_top_ips_chart
)
from modules.logger import setup_logger

# Configure logger
logger = setup_logger()

# Page configuration
st.set_page_config(
    page_title="Mikrotik Traffic Analyzer",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# App title and description
st.title("Mikrotik Traffic Analyzer")
st.markdown("""
This application allows you to analyze and visualize traffic data from Mikrotik routers.
Upload a log file to begin your analysis.
""")

# Initialize session state if not already done
if 'data' not in st.session_state:
    st.session_state.data = None
if 'file_uploaded' not in st.session_state:
    st.session_state.file_uploaded = False
if 'filtered_data' not in st.session_state:
    st.session_state.filtered_data = None
if 'start_date' not in st.session_state:
    st.session_state.start_date = None
if 'end_date' not in st.session_state:
    st.session_state.end_date = None

# Sidebar for file upload and filters
with st.sidebar:
    st.header("Data Input")
    uploaded_file = st.file_uploader("Upload Mikrotik Log File", type=["txt", "log", "csv"])
    
    if uploaded_file is not None:
        try:
            # Read the file and parse the data
            content = uploaded_file.read().decode('utf-8')
            df = parse_mikrotik_logs(content)
            
            if df is not None and not df.empty:
                st.session_state.data = df
                st.session_state.filtered_data = df.copy()
                st.session_state.file_uploaded = True
                
                # Get min and max dates for filter
                if 'timestamp' in df.columns:
                    st.session_state.start_date = df['timestamp'].min()
                    st.session_state.end_date = df['timestamp'].max()
                
                st.success("File successfully processed!")
                logger.info(f"Processed file: {uploaded_file.name}, {len(df)} records")
            else:
                st.error("Could not parse the file. Please check the format.")
                logger.error(f"Failed to parse file: {uploaded_file.name}")
        except Exception as e:
            st.error(f"Error processing file: {str(e)}")
            logger.error(f"Error processing file: {str(e)}")
    
    # Only show filters if data is loaded
    if st.session_state.file_uploaded:
        st.header("Filters")
        
        # Date range filter
        st.subheader("Date Range")
        col1, col2 = st.columns(2)
        with col1:
            start_date = st.date_input(
                "Start Date", 
                value=st.session_state.start_date.date() if st.session_state.start_date else datetime.date.today()
            )
        with col2:
            end_date = st.date_input(
                "End Date", 
                value=st.session_state.end_date.date() if st.session_state.end_date else datetime.date.today()
            )
        
        # IP filter
        st.subheader("IP Address")
        ip_filter = st.text_input("Filter by IP (leave empty for all)")
        
        # Protocol filter
        if 'protocol' in st.session_state.data.columns:
            protocols = ['All'] + sorted(st.session_state.data['protocol'].unique().tolist())
            protocol_filter = st.selectbox("Protocol", protocols)
        else:
            protocol_filter = 'All'
        
        # Apply button
        if st.button("Apply Filters"):
            if st.session_state.data is not None:
                filtered_df = st.session_state.data.copy()
                
                # Apply date filter
                if 'timestamp' in filtered_df.columns:
                    start_datetime = datetime.datetime.combine(start_date, datetime.time.min)
                    end_datetime = datetime.datetime.combine(end_date, datetime.time.max)
                    filtered_df = filtered_df[
                        (filtered_df['timestamp'] >= start_datetime) & 
                        (filtered_df['timestamp'] <= end_datetime)
                    ]
                
                # Apply IP filter
                if ip_filter and ('src_ip' in filtered_df.columns or 'dst_ip' in filtered_df.columns):
                    ip_mask = pd.Series(False, index=filtered_df.index)
                    if 'src_ip' in filtered_df.columns:
                        ip_mask |= filtered_df['src_ip'].str.contains(ip_filter, na=False)
                    if 'dst_ip' in filtered_df.columns:
                        ip_mask |= filtered_df['dst_ip'].str.contains(ip_filter, na=False)
                    filtered_df = filtered_df[ip_mask]
                
                # Apply protocol filter
                if protocol_filter != 'All' and 'protocol' in filtered_df.columns:
                    filtered_df = filtered_df[filtered_df['protocol'] == protocol_filter]
                
                # Update session state
                st.session_state.filtered_data = filtered_df
                
                st.success("Filters applied!")
                logger.info(f"Applied filters: {len(filtered_df)} records after filtering")

        # Reset filters button
        if st.button("Reset Filters"):
            st.session_state.filtered_data = st.session_state.data.copy()
            st.success("Filters reset!")
            st.rerun()

# Main content area with tabs
if st.session_state.file_uploaded and st.session_state.filtered_data is not None:
    tab1, tab2, tab3, tab4, tab5 = st.tabs([
        "Overview", 
        "Bandwidth Analysis", 
        "Connection Analysis", 
        "Top Users/Services", 
        "Export"
    ])
    
    filtered_df = st.session_state.filtered_data
    
    # Process data for visualization and statistics
    traffic_stats = process_traffic_data(filtered_df)
    
    # Tab 1: Overview
    with tab1:
        st.header("Traffic Overview")
        
        # Key metrics in columns
        col1, col2, col3, col4 = st.columns(4)
        with col1:
            st.metric("Total Records", f"{len(filtered_df):,}")
        with col2:
            if 'bytes' in filtered_df.columns:
                total_gb = filtered_df['bytes'].sum() / (1024**3)
                st.metric("Total Traffic", f"{total_gb:.2f} GB")
        with col3:
            if 'src_ip' in filtered_df.columns:
                unique_sources = filtered_df['src_ip'].nunique()
                st.metric("Unique Sources", f"{unique_sources:,}")
        with col4:
            if 'dst_ip' in filtered_df.columns:
                unique_destinations = filtered_df['dst_ip'].nunique()
                st.metric("Unique Destinations", f"{unique_destinations:,}")
        
        # Time series chart for overall traffic
        st.subheader("Traffic Over Time")
        if 'timestamp' in filtered_df.columns and 'bytes' in filtered_df.columns:
            bandwidth_chart = create_bandwidth_chart(filtered_df)
            st.plotly_chart(bandwidth_chart, use_container_width=True)
        
        # Protocol distribution
        if 'protocol' in filtered_df.columns:
            st.subheader("Protocol Distribution")
            protocol_chart = create_protocol_pie(filtered_df)
            st.plotly_chart(protocol_chart, use_container_width=True)
        
        # Traffic by hour of day
        if 'timestamp' in filtered_df.columns and 'bytes' in filtered_df.columns:
            st.subheader("Traffic by Hour of Day")
            hourly_heatmap = create_hourly_heatmap(filtered_df)
            st.plotly_chart(hourly_heatmap, use_container_width=True)
    
    # Tab 2: Bandwidth Analysis
    with tab2:
        st.header("Bandwidth Analysis")
        
        # Bandwidth over time
        st.subheader("Bandwidth Usage Over Time")
        if 'timestamp' in filtered_df.columns and 'bytes' in filtered_df.columns:
            # Allow user to select time interval
            interval = st.selectbox(
                "Time Interval", 
                ["Hourly", "Daily", "Weekly"], 
                index=0
            )
            
            if interval == "Hourly":
                resample_rule = 'H'
            elif interval == "Daily":
                resample_rule = 'D'
            else:
                resample_rule = 'W'
            
            bandwidth_chart = create_bandwidth_chart(filtered_df, resample_rule)
            st.plotly_chart(bandwidth_chart, use_container_width=True)
        
        # Bandwidth by IP
        st.subheader("Bandwidth by IP Address")
        direction = st.radio("Traffic Direction", ["Source", "Destination"])
        
        ip_col = 'src_ip' if direction == "Source" else 'dst_ip'
        if ip_col in filtered_df.columns and 'bytes' in filtered_df.columns:
            top_n = st.slider("Number of top IPs to show", 5, 20, 10)
            ip_chart = create_top_ips_chart(filtered_df, ip_col, top_n)
            st.plotly_chart(ip_chart, use_container_width=True)
    
    # Tab 3: Connection Analysis
    with tab3:
        st.header("Connection Analysis")
        
        # Connections over time
        st.subheader("Connections Over Time")
        if 'timestamp' in filtered_df.columns:
            # Allow user to select time interval
            interval = st.selectbox(
                "Time Interval", 
                ["Hourly", "Daily", "Weekly"], 
                index=0,
                key="conn_interval"
            )
            
            if interval == "Hourly":
                resample_rule = 'H'
            elif interval == "Daily":
                resample_rule = 'D'
            else:
                resample_rule = 'W'
            
            connection_chart = create_connection_chart(filtered_df, resample_rule)
            st.plotly_chart(connection_chart, use_container_width=True)
        
        # Connection pairs (source to destination)
        st.subheader("Top Connection Pairs")
        if 'src_ip' in filtered_df.columns and 'dst_ip' in filtered_df.columns:
            top_n_pairs = st.slider("Number of top connection pairs to show", 5, 20, 10)
            
            # Calculate top connection pairs
            pairs = filtered_df.groupby(['src_ip', 'dst_ip']).size().reset_index(name='count')
            pairs = pairs.sort_values('count', ascending=False).head(top_n_pairs)
            
            # Create figure
            fig = px.bar(
                pairs,
                x='count',
                y=[f"{src} → {dst}" for src, dst in zip(pairs['src_ip'], pairs['dst_ip'])],
                orientation='h',
                title="Top Connection Pairs",
                labels={'y': 'Connection Pair', 'x': 'Count'}
            )
            st.plotly_chart(fig, use_container_width=True)
    
    # Tab 4: Top Users/Services
    with tab4:
        st.header("Top Users and Services")
        
        # Top users by traffic volume
        st.subheader("Top IP Addresses by Traffic Volume")
        if 'src_ip' in filtered_df.columns and 'bytes' in filtered_df.columns:
            # Radio to choose between source and destination IPs
            ip_type = st.radio("IP Type", ["Source IPs", "Destination IPs"], key="traffic_ip_type")
            ip_col = 'src_ip' if ip_type == "Source IPs" else 'dst_ip'
            
            top_n_ips = st.slider("Number of top IPs to show", 5, 20, 10, key="top_traffic_ips")
            
            # Calculate top IPs by traffic
            top_ips = filtered_df.groupby(ip_col)['bytes'].sum().sort_values(ascending=False).head(top_n_ips)
            top_ips = top_ips / (1024**2)  # Convert to MB
            
            # Create figure
            fig = px.bar(
                x=top_ips.values,
                y=top_ips.index,
                orientation='h',
                labels={'x': 'Traffic (MB)', 'y': ip_col},
                title=f"Top {top_n_ips} {ip_type} by Traffic Volume"
            )
            st.plotly_chart(fig, use_container_width=True)
        
        # Top services/ports
        st.subheader("Top Services/Ports")
        if 'dst_port' in filtered_df.columns:
            top_n_ports = st.slider("Number of top ports to show", 5, 20, 10)
            
            # Calculate top ports
            top_ports = filtered_df.groupby('dst_port').size().sort_values(ascending=False).head(top_n_ports)
            
            # Create figure
            fig = px.bar(
                x=top_ports.values,
                y=[str(port) for port in top_ports.index],
                orientation='h',
                labels={'x': 'Connection Count', 'y': 'Destination Port'},
                title=f"Top {top_n_ports} Destination Ports"
            )
            st.plotly_chart(fig, use_container_width=True)
            
            # If we have bytes data, also show traffic by port
            if 'bytes' in filtered_df.columns:
                traffic_by_port = filtered_df.groupby('dst_port')['bytes'].sum().sort_values(ascending=False).head(top_n_ports)
                traffic_by_port = traffic_by_port / (1024**2)  # Convert to MB
                
                fig = px.bar(
                    x=traffic_by_port.values,
                    y=[str(port) for port in traffic_by_port.index],
                    orientation='h',
                    labels={'x': 'Traffic (MB)', 'y': 'Destination Port'},
                    title=f"Top {top_n_ports} Destination Ports by Traffic Volume"
                )
                st.plotly_chart(fig, use_container_width=True)
    
    # Tab 5: Export
    with tab5:
        st.header("Export Analysis Results")
        
        export_format = st.selectbox("Export Format", ["CSV", "Excel", "JSON"])
        
        if st.button("Generate Export"):
            if export_format == "CSV":
                # Create CSV data
                csv_buffer = io.StringIO()
                filtered_df.to_csv(csv_buffer, index=False)
                csv_data = csv_buffer.getvalue()
                
                # Create download button
                st.download_button(
                    label="Download CSV",
                    data=csv_data,
                    file_name="mikrotik_traffic_analysis.csv",
                    mime="text/csv"
                )
                
            elif export_format == "Excel":
                # Create Excel data
                excel_buffer = io.BytesIO()
                filtered_df.to_excel(excel_buffer, index=False)
                excel_data = excel_buffer.getvalue()
                
                # Create download button
                st.download_button(
                    label="Download Excel",
                    data=excel_data,
                    file_name="mikrotik_traffic_analysis.xlsx",
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                )
                
            elif export_format == "JSON":
                # Create JSON data
                json_data = filtered_df.to_json(orient="records")
                
                # Create download button
                st.download_button(
                    label="Download JSON",
                    data=json_data,
                    file_name="mikrotik_traffic_analysis.json",
                    mime="application/json"
                )
            
            st.success("Export generated! Click the download button to save the file.")
        
        # Export charts
        st.subheader("Export Charts")
        chart_to_export = st.selectbox(
            "Select Chart to Export",
            ["Traffic Over Time", "Protocol Distribution", "Top IPs by Traffic", "Connections Over Time"]
        )
        
        if st.button("Generate Chart Image"):
            # Create the selected chart
            if chart_to_export == "Traffic Over Time" and 'timestamp' in filtered_df.columns and 'bytes' in filtered_df.columns:
                fig = create_bandwidth_chart(filtered_df)
            elif chart_to_export == "Protocol Distribution" and 'protocol' in filtered_df.columns:
                fig = create_protocol_pie(filtered_df)
            elif chart_to_export == "Top IPs by Traffic" and 'src_ip' in filtered_df.columns and 'bytes' in filtered_df.columns:
                fig = create_top_ips_chart(filtered_df, 'src_ip', 10)
            elif chart_to_export == "Connections Over Time" and 'timestamp' in filtered_df.columns:
                fig = create_connection_chart(filtered_df)
            else:
                st.error("Cannot generate the selected chart with the available data.")
                fig = None
            
            if fig:
                # Convert chart to image
                img_bytes = fig.to_image(format="png")
                
                # Create download button
                st.download_button(
                    label="Download Chart Image",
                    data=img_bytes,
                    file_name=f"mikrotik_{chart_to_export.lower().replace(' ', '_')}.png",
                    mime="image/png"
                )
                
                st.success("Chart image generated! Click the download button to save the image.")

        # Export statistics summary
        st.subheader("Export Statistics Summary")
        if st.button("Generate Statistics Summary"):
            # Create summary data
            summary = []
            
            # General statistics
            summary.append(["General Statistics", ""])
            summary.append(["Total Records", len(filtered_df)])
            
            if 'bytes' in filtered_df.columns:
                total_gb = filtered_df['bytes'].sum() / (1024**3)
                summary.append(["Total Traffic (GB)", f"{total_gb:.2f}"])
            
            if 'src_ip' in filtered_df.columns:
                summary.append(["Unique Source IPs", filtered_df['src_ip'].nunique()])
            
            if 'dst_ip' in filtered_df.columns:
                summary.append(["Unique Destination IPs", filtered_df['dst_ip'].nunique()])
            
            if 'protocol' in filtered_df.columns:
                summary.append(["Unique Protocols", filtered_df['protocol'].nunique()])
            
            summary.append(["", ""])
            
            # Top source IPs by traffic
            if 'src_ip' in filtered_df.columns and 'bytes' in filtered_df.columns:
                summary.append(["Top 5 Source IPs by Traffic", ""])
                top_src = filtered_df.groupby('src_ip')['bytes'].sum().sort_values(ascending=False).head(5)
                for ip, bytes_val in top_src.items():
                    mb_val = bytes_val / (1024**2)
                    summary.append([ip, f"{mb_val:.2f} MB"])
                
                summary.append(["", ""])
            
            # Top destination IPs by traffic
            if 'dst_ip' in filtered_df.columns and 'bytes' in filtered_df.columns:
                summary.append(["Top 5 Destination IPs by Traffic", ""])
                top_dst = filtered_df.groupby('dst_ip')['bytes'].sum().sort_values(ascending=False).head(5)
                for ip, bytes_val in top_dst.items():
                    mb_val = bytes_val / (1024**2)
                    summary.append([ip, f"{mb_val:.2f} MB"])
                
                summary.append(["", ""])
            
            # Protocol distribution
            if 'protocol' in filtered_df.columns:
                summary.append(["Protocol Distribution", ""])
                protocol_counts = filtered_df['protocol'].value_counts().head(5)
                for protocol, count in protocol_counts.items():
                    summary.append([protocol, count])
            
            # Create CSV data
            csv_buffer = io.StringIO()
            csv_writer = csv.writer(csv_buffer)
            csv_writer.writerows(summary)
            csv_data = csv_buffer.getvalue()
            
            # Create download button
            st.download_button(
                label="Download Statistics Summary",
                data=csv_data,
                file_name="mikrotik_statistics_summary.csv",
                mime="text/csv"
            )
            
            st.success("Statistics summary generated! Click the download button to save the file.")

else:
    # Show welcome message if no file is uploaded
    st.info("👈 Please upload a Mikrotik log file from the sidebar to begin analysis.")
    
    # Show instructions for log file format
    st.subheader("Supported Log File Format")
    st.markdown("""
    This application supports standard Mikrotik log formats. Your log file should contain columns like:
    
    - Timestamp
    - Source IP
    - Destination IP
    - Protocol
    - Source Port
    - Destination Port
    - Bytes transferred
    
    The application will automatically detect the format and parse the data accordingly.
    """)
    
    # Show sample of the expected log format
    st.subheader("Sample Log Format")
    st.code("""
    2023-10-05 08:23:45 src-ip=192.168.1.10 dst-ip=203.0.113.5 protocol=TCP src-port=54321 dst-port=443 bytes=1240
    2023-10-05 08:23:47 src-ip=192.168.1.15 dst-ip=198.51.100.2 protocol=UDP src-port=45678 dst-port=53 bytes=64
    2023-10-05 08:23:48 src-ip=203.0.113.5 dst-ip=192.168.1.10 protocol=TCP src-port=443 dst-port=54321 bytes=8540
    """)
