#!/usr/bin/env python3
"""
Plot classification predictions (valence/arousal) on a 2D plane.
Reads JSON result files from the results directory and visualizes them.
"""

import sys
import io
import json
import os
from pathlib import Path
import matplotlib.pyplot as plt
import numpy as np
from adjustText import adjust_text

# Fix encoding for Windows terminal output
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Configure matplotlib to support CJK characters
plt.rcParams['font.sans-serif'] = ['Microsoft YaHei', 'SimHei', 'DejaVu Sans']
plt.rcParams['axes.unicode_minus'] = False

# Get the directory where this script is located
script_dir = Path(__file__).parent
results_dir = script_dir / "results"

# Collect data
audio_files = []
valence_values = []
arousal_values = []

# Read all JSON files in results directory
json_files = sorted(results_dir.glob("*.json"))

if not json_files:
    print(f"No JSON files found in {results_dir}")
    exit(1)

print(f"Found {len(json_files)} result files")

for json_file in json_files:
    try:
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # Extract classification predictions [valence, arousal]
        if 'classification' in data and data['classification'] is not None:
            predictions = data['classification'].get('predictions', [])
            if len(predictions) >= 2:
                audio_name = data['audio_file']
                valence = predictions[0]
                arousal = predictions[1]
                
                audio_files.append(audio_name)
                valence_values.append(valence)
                arousal_values.append(arousal)
                
                print(f"  + {audio_name}")
                print(f"    └─ Valence: {valence:.3f}, Arousal: {arousal:.3f}")
    except Exception as e:
        print(f"  - Error reading {json_file.name}: {e}")

if not valence_values:
    print("No valid prediction data found")
    exit(1)

print(f"\nPlotting {len(audio_files)} predictions...\n")

# Create figure and plot
fig, ax = plt.subplots(figsize=(14, 10))

# Scatter plot
scatter = ax.scatter(valence_values, arousal_values, s=100, alpha=0.6, c=range(len(audio_files)), 
                     cmap='viridis', edgecolors='black', linewidth=1.5)

# Label each point with the audio file name - position radially outward from points
texts = []
labels_data = []

# Calculate angles and group by angle
angle_groups = {}
for i, audio_name in enumerate(audio_files):
    val = valence_values[i]
    arom = arousal_values[i]
    
    center_val = 5.0
    center_arom = 4.5
    angle = np.arctan2(arom - center_arom, val - center_val)
    
    # Round angle to nearest 0.1 radian to group nearby angles
    angle_bin = round(angle * 10) / 10
    
    if angle_bin not in angle_groups:
        angle_groups[angle_bin] = []
    angle_groups[angle_bin].append((i, audio_name, val, arom, angle))

# Place labels, stacking them radially when multiple points share similar angle
for angle_bin, points in angle_groups.items():
    # Sort by distance from center for this angle
    points.sort(key=lambda x: (x[2] - 5.0)**2 + (x[3] - 4.5)**2)
    
    for rank, (i, audio_name, val, arom, angle) in enumerate(points):
        label = audio_name[:-18] if len(audio_name) > 18 else audio_name
        
        # Base radius plus additional radius for stacked labels
        label_length = len(label)
        base_radius = 2.3 + (label_length * 0.02)
        stack_radius = base_radius + (rank * 0.5)  # Stack labels radially outward
        
        label_val = 5.0 + stack_radius * np.cos(angle)
        label_arom = 4.5 + stack_radius * np.sin(angle)
        
        text = ax.text(label_val, label_arom, label, fontsize=5.5, alpha=0.7,
                       bbox=dict(boxstyle='round,pad=0.25', facecolor='white', alpha=0.65, edgecolor='gray', linewidth=0.4),
                       ha='center', va='center')
        texts.append(text)
        labels_data.append((val, arom))

# Set labels and title
ax.set_xlabel('Valence', fontsize=12, fontweight='bold')
ax.set_ylabel('Arousal', fontsize=12, fontweight='bold')
ax.set_title('Audio Classification: Valence vs Arousal', fontsize=14, fontweight='bold')

# Add grid
ax.grid(True, alpha=0.3, linestyle='--')

# Set axis limits to (1,9) x (1,9)
ax.set_xlim(1, 9)
ax.set_ylim(1, 9)

# Add arrows from labels to points
for text, (val, arom) in zip(texts, labels_data):
    ax.annotate('', xy=(val, arom), xytext=(text.get_position()),
                arrowprops=dict(arrowstyle='->', lw=0.6, alpha=0.5, color='gray'))

# Add colorbar
cbar = plt.colorbar(scatter, ax=ax)
cbar.set_label('Sample Index', fontsize=10)

# Adjust layout to prevent label cutoff
plt.tight_layout()
plt.subplots_adjust(left=0.08, right=0.92, top=0.96, bottom=0.08)

# Save the plot
output_file = script_dir / "predictions_plot.png"
plt.savefig(output_file, dpi=150, bbox_inches='tight')
print(f"Plot saved to: {output_file}")

# Display the plot
plt.show()

# Print summary statistics
print(f"\nSummary Statistics:")
print(f"  Valence - Min: {min(valence_values):.3f}, Max: {max(valence_values):.3f}, Mean: {np.mean(valence_values):.3f}")
print(f"  Arousal - Min: {min(arousal_values):.3f}, Max: {max(arousal_values):.3f}, Mean: {np.mean(arousal_values):.3f}")
