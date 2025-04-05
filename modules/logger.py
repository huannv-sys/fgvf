import logging
import os
import sys
from datetime import datetime

def setup_logger(log_level=logging.INFO):
    """
    Set up and configure the application logger.
    
    Args:
        log_level (int): Logging level (e.g., logging.INFO, logging.DEBUG)
        
    Returns:
        logging.Logger: Configured logger instance
    """
    # Create logger
    logger = logging.getLogger("mikrotik_analyzer")
    logger.setLevel(log_level)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Create console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    
    # Add handlers to logger
    logger.addHandler(console_handler)
    
    # Try to create file handler if possible
    try:
        log_dir = "logs"
        if not os.path.exists(log_dir):
            os.makedirs(log_dir)
        
        log_filename = os.path.join(log_dir, f"mikrotik_analyzer_{datetime.now().strftime('%Y%m%d')}.log")
        file_handler = logging.FileHandler(log_filename)
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        # If we can't create a file handler, just log to console
        logger.warning(f"Unable to create log file: {str(e)}")
    
    logger.info("Logger initialized")
    return logger
