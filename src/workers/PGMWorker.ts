self.onmessage = function (event) {
    try {
      const { sourceType = "pgmFile", mapData } = event.data;
      if (!mapData) {
        console.warn("No map data to process on worker");
        self.postMessage({ data: [], width: 10, height: 10 });
        return;
      }
      const width = mapData.info.width;
      const height = mapData.info.height;
      const rawData = mapData.data;
      const processedData = new Uint8ClampedArray(width * height * 4);
  
      if (sourceType === "rosMap") {
        // Conversion for ROS map: occupancy data conversion.
        for (let i = 0; i < width * height; i++) {
          const occ = rawData[i];
          let pixel;
          if (occ === -1) {
            // Unknown occupancy -> mid-gray.
            pixel = 235;
          } else if (occ === 0) {
            // Free space -> white.
            pixel = 255;
          } else if (occ === 100) {
            // Occupied space -> black.
            pixel = 0;
          } else {
            // Interpolate between free (255) and occupied (0).
            pixel = 255 - Math.round((occ * 255) / 100);
          }
          const offset = i * 4;
          processedData[offset] = pixel;
          processedData[offset + 1] = pixel;
          processedData[offset + 2] = pixel;
          processedData[offset + 3] = 255;
        }
      } else if (sourceType === "liveCostmap") {
        // Conversion for live costmap: apply a color gradient and transparency.
        for (let i = 0; i < width * height; i++) {
          const occupancyValue = rawData[i];
          let color;
          if (occupancyValue === 0) {
            color = [0, 0, 0, 0]; // Fully transparent black.
          } else if (occupancyValue >= 1 && occupancyValue <= 98) {
            const intensity = (255 * occupancyValue) / 100;
            color = [intensity, 0, 255 - intensity, 255]; // Gradient from blue to green.
          } else if (occupancyValue === 99) {
            color = [0, 255, 255, 255]; // Cyan for near-total occupancy.
          } else if (occupancyValue === 100) {
            color = [255, 0, 255, 255]; // Magenta for maximum occupancy.
          } else if (occupancyValue < 0) {
            color = [112, 137, 134, 15]; // Subtle shade for special values.
          } else {
            color = [0, 0, 0, 255]; // Fallback color.
          }
          const offset = i * 4;
          processedData[offset] = color[0];
          processedData[offset + 1] = color[1];
          processedData[offset + 2] = color[2];
          processedData[offset + 3] = color[3];
        }
      } else {
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            // Calculate source index by inverting the row.
            const sourceIndex = (height - 1 - y) * width + x;
            const offset = (y * width + x) * 4;
            const gray = rawData[sourceIndex];
            processedData[offset] = gray;
            processedData[offset + 1] = gray;
            processedData[offset + 2] = gray;
            processedData[offset + 3] = 255;
          }
        }
      }
      self.postMessage({ data: processedData, width, height });
    } catch (error) {
      console.error("Error in worker:", error);
      self.postMessage({ data: [], width: 10, height: 10 });
    }
  };
  