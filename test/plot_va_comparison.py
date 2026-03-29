#!/usr/bin/env python3
"""
Plot valence/arousal predictions from both essentia classifier and regressor.
Compares results from two methods on the same 2D plane with indexed IDs.
"""

import sys
import io
import json
import os
from pathlib import Path
from collections import defaultdict
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
essentia_dir = script_dir / "results"      # Essentia classifier results
regressor_dir = script_dir / "res_regr"    # Regressor results

# Data structure: {audio_filename: {method: {valence, arousal, id, prefix}}}
data_points = defaultdict(dict)
audio_to_id = {}  # Map audio filename to ID
next_id = 1

print("=" * 60)
print("Valence-Arousal Comparison: Essentia vs Regressor")
print("=" * 60)

# ===================== Read Essentia Classifier Results =====================
print("\n📊 Reading Essentia Classifier results...")
essentia_count = 0

if essentia_dir.exists():
    json_files = sorted(essentia_dir.glob("*.json"))
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Extract audio filename (remove the timestamp suffix)
            audio_name = data.get('audio_file', '')
            if not audio_name:
                continue
            
            # Remove timestamp suffix added by test script (format: ...._yyyyMMdd_HHmmss_fff)
            # The original filename is everything before _yyyyMMdd pattern
            parts = audio_name.rsplit('_', 1)
            original_filename = parts[0] if len(parts) > 1 else audio_name
            
            # Get classification predictions [valence, arousal]
            if 'classification' in data and data['classification'] is not None:
                predictions = data['classification'].get('predictions', [])
                if len(predictions) >= 2:
                    valence = float(predictions[0])
                    arousal = float(predictions[1])
                    
                    # Assign ID if this audio file is new
                    if original_filename not in audio_to_id:
                        audio_to_id[original_filename] = next_id
                        next_id += 1
                    
                    audio_id = audio_to_id[original_filename]
                    
                    data_points[original_filename]['essentia'] = {
                        'valence': valence,
                        'arousal': arousal,
                        'id': audio_id,
                        'prefix': 'A'
                    }
                    
                    essentia_count += 1
                    print(f"  + {original_filename}")
                    print(f"    └─ A{audio_id}: V={valence:.3f}, A={arousal:.3f}")
        except Exception as e:
            print(f"  - Error reading {json_file.name}: {e}")
else:
    print(f"  ⚠️  Directory not found: {essentia_dir}")

print(f"✓ Found {essentia_count} Essentia results")

# ===================== Read Regressor Results =====================
print("\n📊 Reading Regressor results...")
regressor_count = 0

if regressor_dir.exists():
    json_files = sorted(regressor_dir.glob("*.json"))
    
    for json_file in json_files:
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            # Extract audio filename (remove the timestamp suffix)
            audio_name = data.get('audio_file', '')
            if not audio_name:
                continue
            
            # Remove timestamp suffix
            parts = audio_name.rsplit('_', 1)
            original_filename = parts[0] if len(parts) > 1 else audio_name
            
            # Get regressor predictions
            valence = data.get('valence')
            arousal = data.get('arousal')
            
            if valence is not None and arousal is not None:
                valence = float(valence)
                arousal = float(arousal)
                
                # Assign ID if this audio file is new
                if original_filename not in audio_to_id:
                    audio_to_id[original_filename] = next_id
                    next_id += 1
                
                audio_id = audio_to_id[original_filename]
                
                data_points[original_filename]['regressor'] = {
                    'valence': valence,
                    'arousal': arousal,
                    'id': audio_id,
                    'prefix': 'B'
                }
                
                regressor_count += 1
                print(f"  + {original_filename}")
                print(f"    └─ B{audio_id}: V={valence:.3f}, A={arousal:.3f}")
        except Exception as e:
            print(f"  - Error reading {json_file.name}: {e}")
else:
    print(f"  ⚠️  Directory not found: {regressor_dir}")

print(f"✓ Found {regressor_count} Regressor results")

# ===================== Prepare plot data =====================
print(f"\n✓ Total unique audio files: {len(audio_to_id)}")
print(f"✓ Total data points: {essentia_count + regressor_count}")

if not data_points:
    print("No valid data found")
    exit(1)

# Flatten data for plotting
plot_data = []
for audio_filename, methods in data_points.items():
    for method, info in methods.items():
        valence = info['valence']
        arousal = info['arousal']
        
        plot_data.append({
            'filename': audio_filename,
            'method': method,
            'valence': valence,
            'arousal': arousal,
            'id': info['id'],
            'prefix': info['prefix'],
            'label': f"{info['prefix']}{info['id']}"
        })

# ===================== Create plot =====================
print("\nGenerating plot...")

# Create a larger figure with GridSpec for plot + table
import matplotlib.gridspec as gridspec
fig = plt.figure(figsize=(20, 12))
gs = gridspec.GridSpec(1, 2, width_ratios=[3, 1], wspace=0.3)
ax = fig.add_subplot(gs[0])

# Prepare table data for the right side
table_data = []
for filename, audio_id in sorted(audio_to_id.items(), key=lambda x: x[1]):
    methods = list(data_points[filename].keys())
    method_str = "+".join([m[0].upper() for m in methods])
    # Truncate filename for display in table
    display_name = filename if len(filename) <= 35 else filename[:32] + "..."
    table_data.append([f"{audio_id:2d}", display_name, method_str])

# Add table on the right side
ax_table = fig.add_subplot(gs[1])
ax_table.axis('tight')
ax_table.axis('off')

table = ax_table.table(cellText=table_data,
                       colLabels=['ID', 'Audio File', 'Method'],
                       cellLoc='left',
                       loc='center',
                       colWidths=[0.08, 0.65, 0.12])
table.auto_set_font_size(False)
table.set_fontsize(7)
table.scale(1, 1.5)

# Style the table header
for i in range(3):
    table[(0, i)].set_facecolor('#4CAF50')
    table[(0, i)].set_text_props(weight='bold', color='white')

# Alternate row colors
for i in range(1, len(table_data) + 1):
    for j in range(3):
        if i % 2 == 0:
            table[(i, j)].set_facecolor('#f0f0f0')
        else:
            table[(i, j)].set_facecolor('#ffffff')

# Create color map for IDs (use distinct colors)
unique_ids = sorted(set(p['id'] for p in plot_data))
colormap = plt.get_cmap('hsv')
colors = [colormap(i / max(len(unique_ids), 1)) for i in range(len(unique_ids))]
id_to_color = {uid: colors[i % len(colors)] for i, uid in enumerate(unique_ids)}

# Plot each data point
for point in plot_data:
    color = id_to_color[point['id']]
    marker = 's' if point['method'] == 'essentia' else 'o'  # Square for Essentia, Circle for Regressor
    ax.scatter(point['valence'], point['arousal'], 
              c=[color], s=150, alpha=0.7, 
              marker=marker, edgecolors='black', linewidth=1.5,
              label=f"ID {point['id']}" if point == plot_data[0] else "")

# Note: ID labels removed - see mapping table on the right instead
# texts = []
# for point in plot_data:
#     text = ax.text(point['valence'], point['arousal'], 
#                    point['label'],
#                    fontsize=8, fontweight='bold',
#                    bbox=dict(boxstyle='round,pad=0.3', 
#                             facecolor='white', alpha=0.8, 
#                             edgecolor='black', linewidth=0.5),
#                    ha='center', va='center', zorder=5)
#     texts.append(text)

# Avoid overlapping labels
# try:
#     adjust_text(texts, arrowprops=dict(arrowstyle='->', lw=0.5, alpha=0.5))
# except:
#     pass  # If adjust_text fails, continue without adjustment

# Labels and title
ax.set_xlabel('Valence (pleasantness)', fontsize=12, fontweight='bold')
ax.set_ylabel('Arousal (energy/intensity)', fontsize=12, fontweight='bold')
ax.set_title('Valence-Arousal Comparison: Essentia Classifier (A) vs Regressor (B)', 
            fontsize=14, fontweight='bold', pad=20)

# Grid
ax.grid(True, alpha=0.3, linestyle='--')

# Set axis limits to [1, 9] for both (essentia scale)
ax.set_xlim(0.5, 9.5)
ax.set_ylim(0.5, 9.5)

# Add legend
from matplotlib.patches import Patch
from matplotlib.lines import Line2D
legend_elements = [
    Line2D([0], [0], marker='s', color='w', markerfacecolor='gray', 
           markersize=8, label='Essentia Classifier', markeredgecolor='black'),
    Line2D([0], [0], marker='o', color='w', markerfacecolor='gray', 
           markersize=8, label='Regressor', markeredgecolor='black')
]
ax.legend(handles=legend_elements, loc='upper left', fontsize=10)

# Adjust layout manually (avoid tight_layout with GridSpec)
plt.subplots_adjust(left=0.08, right=0.75, top=0.95, bottom=0.08)

# Save
output_file = script_dir / "va_comparison_plot.png"
plt.savefig(output_file, dpi=150)
print(f"✓ Plot saved to: {output_file}")

# Show
plt.show()

# ===================== Print summary =====================
print("\n" + "=" * 60)
print("Summary Statistics")
print("=" * 60)

essentia_vals = [p['valence'] for p in plot_data if p['method'] == 'essentia']
essentia_arous = [p['arousal'] for p in plot_data if p['method'] == 'essentia']
regressor_vals = [p['valence'] for p in plot_data if p['method'] == 'regressor']
regressor_arous = [p['arousal'] for p in plot_data if p['method'] == 'regressor']

if essentia_vals:
    print("\nEssentia Classifier (A):")
    print(f"  Valence  - Min: {min(essentia_vals):.3f}, Max: {max(essentia_vals):.3f}, Mean: {np.mean(essentia_vals):.3f}")
    print(f"  Arousal  - Min: {min(essentia_arous):.3f}, Max: {max(essentia_arous):.3f}, Mean: {np.mean(essentia_arous):.3f}")

if regressor_vals:
    print("\nRegressor (B):")
    print(f"  Valence  - Min: {min(regressor_vals):.3f}, Max: {max(regressor_vals):.3f}, Mean: {np.mean(regressor_vals):.3f}")
    print(f"  Arousal  - Min: {min(regressor_arous):.3f}, Max: {max(regressor_arous):.3f}, Mean: {np.mean(regressor_arous):.3f}")

print("\nAudio File to ID Mapping:")
mapping_list = []
for idx, (filename, audio_id) in enumerate(sorted(audio_to_id.items(), key=lambda x: x[1]), 1):
    methods = list(data_points[filename].keys())
    method_str = "+".join([m[0].upper() for m in methods])
    mapping_list.append({
        'id': audio_id,
        'filename': filename,
        'methods': method_str
    })

print(f"✓ Total unique audio files: {len(mapping_list)}")

print("\n" + "=" * 60)
