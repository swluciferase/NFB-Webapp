/* tslint:disable */
/* eslint-disable */

/**
 * WASM-exposed NormEngine struct.
 */
export class NormEngine {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Load from AES-GCM encrypted .bin.enc bytes.
     */
    constructor(encrypted_bin: Uint8Array);
    /**
     * Z-score sensor-space QEEG metrics.
     * `band_power`:   [n_electrodes × n_bands]
     * `coherence`:    [n_coh_pairs × n_bands]
     * `asymmetry`:    [n_asym_pairs × n_bands]
     * `custom_bands`: flat [lo1,hi1,lo2,hi2,...] Hz
     * Returns concatenated Z-scores in same layout.
     */
    zscore_qeeg(band_power: Float32Array, coherence: Float32Array, asymmetry: Float32Array, custom_bands: Float32Array, age_years: number): Float32Array;
    /**
     * Z-score source-space ROI power.
     * `roi_power`: [n_rois × n_bands]
     */
    zscore_roi(roi_power: Float32Array, custom_bands: Float32Array, age_years: number): Float32Array;
    /**
     * Z-score source-space ROI-pair PLV.
     * `plv_matrix`: [n_roi_pairs × n_bands]
     */
    zscore_roi_plv(plv_matrix: Float32Array, custom_bands: Float32Array, age_years: number): Float32Array;
}
