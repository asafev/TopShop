"""
Fingerprint Data Scraper and DataFrame Converter
Scrapes the fingerprint-data.json.html page and converts to pandas DataFrames
"""

import json
import time
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


class FingerprintScraper:
    """Scrape browser fingerprint data and convert to DataFrames"""
    
    def __init__(self, url='http://localhost:8000/fingerprint-data.json.html'):
        """
        Initialize the scraper
        
        Args:
            url: URL to the fingerprint JSON page
        """
        self.url = url
        self.driver = None
        self.fingerprint_data = None
    
    def scrape(self, headless=False, wait_time=10):
        """
        Scrape fingerprint data from the page
        
        Args:
            headless: Run browser in headless mode (will have different fingerprint!)
            wait_time: Maximum seconds to wait for data
            
        Returns:
            dict: Fingerprint data
        """
        print(f"🌐 Opening {self.url}...")
        
        # Setup Chrome driver
        options = webdriver.ChromeOptions()
        if headless:
            options.add_argument('--headless')
        
        self.driver = webdriver.Chrome(options=options)
        
        try:
            # Load page
            self.driver.get(self.url)
            
            # Wait for the behavioral collection to complete (7+ seconds)
            print("⏳ Waiting for behavioral data collection (7 seconds)...")
            print("   (The page needs user interaction - move mouse, click, scroll)")
            
            # Wait for the status to show "ready"
            WebDriverWait(self.driver, wait_time).until(
                EC.presence_of_element_located((By.ID, 'json-output'))
            )
            
            # Additional wait to ensure data is fully loaded
            time.sleep(1)
            
            # Get the JSON content
            json_element = self.driver.find_element(By.ID, 'json-output')
            json_text = json_element.text
            
            if not json_text or json_text.startswith('Please interact'):
                raise ValueError("JSON data not ready yet")
            
            # Parse JSON
            self.fingerprint_data = json.loads(json_text)
            
            print(f"✅ Fingerprint data collected!")
            print(f"   - Timestamp: {self.fingerprint_data.get('timestamp', 'N/A')}")
            print(f"   - Total categories: {len(self.fingerprint_data.get('metrics', {}))}")
            
            return self.fingerprint_data
            
        except Exception as e:
            print(f"❌ Error scraping fingerprint: {e}")
            raise
        finally:
            if self.driver:
                self.driver.quit()
    
    def to_dataframes(self):
        """
        Convert fingerprint data to pandas DataFrames
        
        Returns:
            dict: Dictionary of DataFrames:
                - 'metrics': Flattened metrics data
                - 'behavioral': Behavioral indicators
                - 'telemetry': Raw behavioral telemetry stats
                - 'summary': Overall summary
        """
        if not self.fingerprint_data:
            raise ValueError("No fingerprint data available. Run scrape() first.")
        
        dfs = {}
        
        # 1. Flatten metrics into DataFrame
        metrics_list = []
        for category, category_metrics in self.fingerprint_data.get('metrics', {}).items():
            for metric_name, metric_data in category_metrics.items():
                metrics_list.append({
                    'category': category,
                    'metric': metric_name,
                    'value': metric_data.get('value'),
                    'description': metric_data.get('description', ''),
                    'risk': metric_data.get('risk', 'N/A'),
                    'raw_value': metric_data.get('rawValue')
                })
        
        dfs['metrics'] = pd.DataFrame(metrics_list)
        
        # 2. Behavioral indicators DataFrame
        behavioral_data = self.fingerprint_data.get('metrics', {}).get('behavioralIndicators', {})
        if behavioral_data:
            behavioral_list = []
            for indicator_name, indicator_data in behavioral_data.items():
                behavioral_list.append({
                    'indicator': indicator_name,
                    'count': indicator_data.get('count', 0),
                    'confidence': indicator_data.get('confidence', 0),
                    'detected': indicator_data.get('detected', False),
                    'latest_detail': str(indicator_data.get('latestDetail', {}))
                })
            dfs['behavioral'] = pd.DataFrame(behavioral_list)
        else:
            dfs['behavioral'] = pd.DataFrame()
        
        # 3. Behavioral Telemetry DataFrame (NEW)
        telemetry_data = self.fingerprint_data.get('metrics', {}).get('behavioralTelemetry', {})
        if telemetry_data:
            telemetry_list = []
            for metric_name, metric_info in telemetry_data.items():
                telemetry_list.append({
                    'metric': metric_name,
                    'value': metric_info.get('value'),
                    'description': metric_info.get('description', ''),
                    'type': 'telemetry'
                })
            dfs['telemetry'] = pd.DataFrame(telemetry_list)
        else:
            dfs['telemetry'] = pd.DataFrame()
        
        # 4. Summary DataFrame
        summary_data = self.fingerprint_data.get('summary', {})
        if summary_data:
            dfs['summary'] = pd.DataFrame([summary_data])
        else:
            dfs['summary'] = pd.DataFrame()
        
        # 5. Behavioral summary DataFrame
        behavioral_summary = self.fingerprint_data.get('behavioralSummary', {})
        if behavioral_summary:
            dfs['behavioral_summary'] = pd.DataFrame([behavioral_summary])
        else:
            dfs['behavioral_summary'] = pd.DataFrame()
        
        print("\n📊 DataFrames created:")
        print(f"   - Metrics: {len(dfs['metrics'])} rows")
        print(f"   - Behavioral: {len(dfs['behavioral'])} rows")
        print(f"   - Telemetry: {len(dfs['telemetry'])} rows")
        print(f"   - Summary: {len(dfs['summary'])} rows")
        print(f"   - Behavioral Summary: {len(dfs['behavioral_summary'])} rows")
        
        return dfs
    
    def save_to_csv(self, output_dir='.'):
        """
        Save DataFrames to CSV files
        
        Args:
            output_dir: Directory to save CSV files
        """
        dfs = self.to_dataframes()
        
        timestamp = self.fingerprint_data.get('timestamp', 'unknown').replace(':', '-')
        
        for name, df in dfs.items():
            if not df.empty:
                filename = f"{output_dir}/fingerprint_{name}_{timestamp}.csv"
                df.to_csv(filename, index=False)
                print(f"💾 Saved: {filename}")


def main():
    """Example usage"""
    
    # Example 1: Scrape and convert to DataFrames
    scraper = FingerprintScraper('http://localhost:8000/fingerprint-data.json.html')
    
    try:
        # Scrape the data (waits for behavioral collection)
        fingerprint_data = scraper.scrape(headless=False, wait_time=15)
        
        # Convert to DataFrames
        dfs = scraper.to_dataframes()
        
        # Access individual DataFrames
        metrics_df = dfs['metrics']
        behavioral_df = dfs['behavioral']
        telemetry_df = dfs['telemetry']
        summary_df = dfs['summary']
        
        # Example analysis
        print("\n📈 Sample Analysis:")
        print("\n1. Metrics by category:")
        print(metrics_df.groupby('category').size())
        
        print("\n2. High-risk metrics:")
        print(metrics_df[metrics_df['risk'] == 'High'][['category', 'metric', 'value']])
        
        print("\n3. Behavioral indicators detected:")
        if not behavioral_df.empty:
            detected = behavioral_df[behavioral_df['detected'] == True]
            print(detected[['indicator', 'count', 'confidence']])
        else:
            print("   No behavioral indicators detected")
        
        print("\n4. Behavioral Telemetry Stats:")
        if not telemetry_df.empty:
            print(telemetry_df[['metric', 'value', 'description']])
            print(f"\n   📊 Key Stats:")
            print(f"   - Total Mouse Moves: {telemetry_df[telemetry_df['metric'] == 'totalMouseMoves']['value'].values[0] if len(telemetry_df[telemetry_df['metric'] == 'totalMouseMoves']) > 0 else 0}")
            print(f"   - Total Clicks: {telemetry_df[telemetry_df['metric'] == 'totalClicks']['value'].values[0] if len(telemetry_df[telemetry_df['metric'] == 'totalClicks']) > 0 else 0}")
            print(f"   - Total Scrolls: {telemetry_df[telemetry_df['metric'] == 'totalScrolls']['value'].values[0] if len(telemetry_df[telemetry_df['metric'] == 'totalScrolls']) > 0 else 0}")
        else:
            print("   No telemetry data available")
        
        # Save to CSV files
        scraper.save_to_csv('.')
        
        print("\n✅ Scraping complete!")
        
    except Exception as e:
        print(f"\n❌ Error: {e}")


if __name__ == '__main__':
    main()
