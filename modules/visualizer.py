import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import numpy as np
from datetime import datetime, timedelta

def create_bandwidth_chart(df, resample_rule='H'):
    """
    Create a chart showing bandwidth usage over time.
    
    Args:
        df (pandas.DataFrame): The dataframe containing traffic data
        resample_rule (str): Rule for resampling time series ('H' for hourly, 'D' for daily, etc.)
        
    Returns:
        plotly.graph_objs._figure.Figure: The plotly figure object
    """
    if 'timestamp' not in df.columns or 'bytes' not in df.columns:
        return go.Figure().update_layout(title="Insufficient data for bandwidth chart")
    
    # Make a copy to avoid modifying the original dataframe
    df_copy = df.copy()
    
    # Set timestamp as index for resampling
    df_copy.set_index('timestamp', inplace=True)
    
    # Resample the data
    bandwidth_data = df_copy['bytes'].resample(resample_rule).sum() / (1024**2)  # Convert to MB
    
    # Create the figure
    fig = go.Figure()
    
    fig.add_trace(go.Scatter(
        x=bandwidth_data.index,
        y=bandwidth_data.values,
        mode='lines+markers',
        name='Bandwidth (MB)',
        line=dict(width=2, color='#1f77b4'),
        marker=dict(size=6)
    ))
    
    # Set layout
    fig.update_layout(
        title='Bandwidth Usage Over Time',
        xaxis_title='Time',
        yaxis_title='Traffic (MB)',
        hovermode='x unified',
        template='plotly_white'
    )
    
    return fig

def create_connection_chart(df, resample_rule='H'):
    """
    Create a chart showing connection counts over time.
    
    Args:
        df (pandas.DataFrame): The dataframe containing traffic data
        resample_rule (str): Rule for resampling time series ('H' for hourly, 'D' for daily, etc.)
        
    Returns:
        plotly.graph_objs._figure.Figure: The plotly figure object
    """
    if 'timestamp' not in df.columns:
        return go.Figure().update_layout(title="Insufficient data for connection chart")
    
    # Make a copy to avoid modifying the original dataframe
    df_copy = df.copy()
    
    # Set timestamp as index for resampling
    df_copy.set_index('timestamp', inplace=True)
    
    # Count connections per time interval
    connections_data = df_copy.resample(resample_rule).size()
    
    # Create the figure
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=connections_data.index,
        y=connections_data.values,
        name='Connections',
        marker_color='#ff7f0e'
    ))
    
    # Set layout
    fig.update_layout(
        title='Connection Count Over Time',
        xaxis_title='Time',
        yaxis_title='Number of Connections',
        hovermode='x unified',
        template='plotly_white'
    )
    
    return fig

def create_protocol_pie(df):
    """
    Create a pie chart showing protocol distribution.
    
    Args:
        df (pandas.DataFrame): The dataframe containing traffic data
        
    Returns:
        plotly.graph_objs._figure.Figure: The plotly figure object
    """
    if 'protocol' not in df.columns:
        return go.Figure().update_layout(title="Protocol data not available")
    
    # Count protocols
    protocol_counts = df['protocol'].value_counts()
    
    # If there are too many protocols, keep only the top ones
    if len(protocol_counts) > 10:
        other_count = protocol_counts[10:].sum()
        protocol_counts = protocol_counts[:10]
        protocol_counts['Other'] = other_count
    
    # Create figure
    fig = px.pie(
        values=protocol_counts.values,
        names=protocol_counts.index,
        title='Protocol Distribution',
        hole=0.4,
        color_discrete_sequence=px.colors.qualitative.Set3
    )
    
    # Set layout
    fig.update_layout(
        legend_title='Protocol',
        template='plotly_white'
    )
    
    return fig

def create_hourly_heatmap(df):
    """
    Create a heatmap showing traffic patterns by hour of day and day of week.
    
    Args:
        df (pandas.DataFrame): The dataframe containing traffic data
        
    Returns:
        plotly.graph_objs._figure.Figure: The plotly figure object
    """
    if 'timestamp' not in df.columns:
        return go.Figure().update_layout(title="Timestamp data not available")
    
    # Make a copy to avoid modifying the original dataframe
    df_copy = df.copy()
    
    # Extract hour and day of week
    df_copy['hour'] = df_copy['timestamp'].dt.hour
    df_copy['day_of_week'] = df_copy['timestamp'].dt.dayofweek  # Monday=0, Sunday=6
    
    # Map day numbers to names
    day_names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    
    # Group by day and hour
    if 'bytes' in df_copy.columns:
        # Use traffic volume if available
        heatmap_data = df_copy.groupby(['day_of_week', 'hour'])['bytes'].sum().reset_index()
        heatmap_data['bytes'] = heatmap_data['bytes'] / (1024**2)  # Convert to MB
        z_title = 'Traffic (MB)'
        z_values = 'bytes'
    else:
        # Otherwise use connection count
        heatmap_data = df_copy.groupby(['day_of_week', 'hour']).size().reset_index(name='count')
        z_title = 'Connection Count'
        z_values = 'count'
    
    # Create pivot table for heatmap
    pivot_data = heatmap_data.pivot(index='day_of_week', columns='hour', values=z_values)
    
    # Reorder rows to start with Monday
    pivot_data = pivot_data.reindex(list(range(7)))
    
    # Create figure
    fig = go.Figure(data=go.Heatmap(
        z=pivot_data.values,
        x=list(range(24)),  # Hours 0-23
        y=[day_names[i] for i in pivot_data.index],
        colorscale='Viridis',
        hoverongaps=False
    ))
    
    # Set layout
    fig.update_layout(
        title='Traffic Activity by Hour and Day',
        xaxis_title='Hour of Day',
        yaxis_title='Day of Week',
        xaxis=dict(tickmode='array', tickvals=list(range(24))),
        coloraxis_colorbar=dict(title=z_title),
        template='plotly_white'
    )
    
    return fig

def create_top_ips_chart(df, ip_column, top_n=10):
    """
    Create a bar chart showing top IPs by traffic volume.
    
    Args:
        df (pandas.DataFrame): The dataframe containing traffic data
        ip_column (str): Column name for IP addresses ('src_ip' or 'dst_ip')
        top_n (int): Number of top IPs to show
        
    Returns:
        plotly.graph_objs._figure.Figure: The plotly figure object
    """
    if ip_column not in df.columns or 'bytes' not in df.columns:
        return go.Figure().update_layout(title="Insufficient data for IP traffic chart")
    
    # Group by IP and sum bytes
    ip_traffic = df.groupby(ip_column)['bytes'].sum().sort_values(ascending=False).head(top_n)
    
    # Convert to MB for better readability
    ip_traffic = ip_traffic / (1024**2)
    
    # Create the figure
    fig = go.Figure()
    
    fig.add_trace(go.Bar(
        x=ip_traffic.index,
        y=ip_traffic.values,
        marker_color='#2ca02c'
    ))
    
    # Set layout
    fig.update_layout(
        title=f'Top {top_n} IPs by Traffic Volume',
        xaxis_title='IP Address',
        yaxis_title='Traffic (MB)',
        template='plotly_white'
    )
    
    return fig
