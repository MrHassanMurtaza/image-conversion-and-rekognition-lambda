const AWS = require('aws-sdk');
const gm = require('gm')
    .subClass({ imageMagick: true });
const util = require('util');
const mysql = require('mysql');

// Clients
const s3 = new AWS.S3({});
const R = new AWS.Rekognition();

// reading other buckets enviornment variables
const DESTINATION_BUCKET = process.env.DESTINATION_BUCKET;
const PREVIEW_BUCKET = process.env.PREVIEW_BUCKET;
const LABELS_TABLE = process.env.LABELS_TABLE;
const UNPROCESSED_TABLE = process.env.UNPROCESSED_TABLE;
const PROCESSED_TABLE = process.env.PROCESSED_TABLE;

// settings for thumbnails
// constants
const MAX_WIDTH_THUMBNAIL = 100;
const MAX_HEIGHT_THUMBNAIL = 100;

// settings for previews
// constants
const MAX_WIDTH_PREVIEW = 600;

// configurations
const config = require('./config.json');


var createPreview = (imageType, response) => {
    return new Promise((resolve, reject) => {
        gm(response.Body).size(function (err, size) {
            if (err) {
                // console.error('Error while creating preview ==>', err)
                reject(err);
            }
            // Infer the scaling factor to avoid stretching the image unnaturally.
            var scalingFactor = Math.min(
                MAX_WIDTH_PREVIEW / size.width,
            );
            var width = scalingFactor * size.width;

            // Transform the image buffer in memory.
            this.resize(width)
                .toBuffer(imageType, function (err, buffer) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
        });
    });
}

var createThumbnail = (imageType, response) => {
    return new Promise((resolve, reject) => {
        console.log('Thumbnail ===>', response.Body)
        gm(response.Body).size(function (err, size) {
            if (err) {
                // console.error('Error while creating thumbnail ==>', err)
                reject(err);
            }

            console.log('size', size)
            // Infer the scaling factor to avoid stretching the image unnaturally.
            var scalingFactor = Math.min(
                MAX_WIDTH_THUMBNAIL / size.width,
                MAX_HEIGHT_THUMBNAIL / size.height
            );
            var width = scalingFactor * size.width;
            var height = scalingFactor * size.height;

            // Transform the image buffer in memory.
            this.resize(width, height)
                .toBuffer(imageType, function (err, buffer) {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(buffer);
                    }
                });
        });
    });
}

var convertFileToPng = (response) => {
    console.log(response.Body)
    return new Promise((resolve, reject) => {
        gm(response.Body)
            .toBuffer('png', function (err, buffer) {
                if (err) {
                    // console.error('Error ====>', err)
                    reject(err);
                } else {
                    console.log('No error =======>', buffer)
                    resolve(buffer);
                }
            });
    })
}

var convertGifToPngAndPdf = (response) => {
    console.log(response.Body)
    return new Promise((resolve, reject) => {
        gm(response.Body)
            .selectFrame(0)
            .toBuffer('png', function (err, buffer) {
                if (err) {
                    // console.error('Error ====>', err)
                    reject(err);
                } else {
                    console.log('No error =======>', buffer)
                    resolve(buffer);
                }
            });
    })
}

var getS3Object = (bucket, key) => {

    return s3.getObject({
        Bucket: bucket,
        Key: key
    }).promise();

}

var putS3Object = (bucket, key, thumbnail, response) => {
    return s3.putObject({
        Bucket: bucket,
        Key: key,
        Body: thumbnail,
        ContentType: response.ContentType
    }).promise();
}

var getRDSConnectionPool = () => {
    return mysql.createPool({
        host: config.dbhost,
        user: config.dbuser,
        password: config.dbpassword,
        database: config.dbname,
        queueLimit: 0, // unlimited queueing
        connectionLimit: 100,
        multipleStatements: true,
        connectTimeout: 60 * 60 * 1000,
        acquireTimeout: 60 * 60 * 1000,
        timeout: 60 * 60 * 1000,
    });

}

var insertUnProcessedFiles = (pool, fileName, srcKey, fileSize, srcBucket) => {
    return new Promise((resolve, reject) => {
        pool.getConnection(function (err, connection) {
            if (err) {
                connection.release();
                reject(err);
            }
            console.log('Connection successful');
            // console.log(file_name, file_path, file_size, src_bucket, thumbnail_bucket, thumbnail_location, preview_bucket, preview_location);
            // Use the connection
            connection.query("INSERT INTO " + UNPROCESSED_TABLE + "(file_name, file_path, file_size, src_bucket) VALUES ( '" + fileName + "', '" + srcKey + "', " + fileSize + ", '" + srcBucket + "')"
                , function (error, results) {
                    // And done with the connection.
                    // Handle error after the release.
                    if (error) {
                        // console.error(error);       
                        connection.release();
                        reject(error);
                    }
                    else {
                        console.log(results);
                        let insertId = results['insertId']
                        let labelsArray = []
                        labels.map((singleEle) => {
                            labelsArray.push([singleEle['Name'], singleEle['Confidence'], insertId])
                        })
                        console.log(labelsArray)

                        connection.query("INSERT INTO " + LABELS_TABLE + " VALUES ?",
                            [labelsArray]
                            , function (error, results, fields) {
                                if (error) {
                                    // console.error(error); 
                                    connection.release();
                                    reject(error);
                                }
                                else {
                                    connection.release();
                                    resolve(results);

                                }
                            })
                    }
                });
        });
    });
}

var insertProcessedFiles = (pool, labels, file_name, file_path, file_size, src_bucket, thumbnail_bucket, thumbnail_location, preview_bucket, preview_location) => {
    return new Promise((resolve, reject) => {
        pool.getConnection(function (err, connection) {
            if (err) {
                connection.release();
                reject(err);
            }
            console.log('Connection successful');
            // console.log(file_name, file_path, file_size, src_bucket, thumbnail_bucket, thumbnail_location, preview_bucket, preview_location);
            // Use the connection
            connection.query("INSERT INTO " + PROCESSED_TABLE + "(file_name, file_path, file_size, src_bucket, thumbnail_bucket, thumbnail_location, preview_bucket, preview_location) VALUES ( '" + file_name + "', '" + file_path + "', " + file_size + ", '" + src_bucket + "', '" + thumbnail_bucket + "', '" + thumbnail_location + "', '" + preview_bucket + "', '" + preview_location + "')"
                , function (error, results) {
                    // And done with the connection.
                    // Handle error after the release.
                    if (error) {
                        // console.error(error);       
                        connection.release();
                        reject(error);
                    }
                    else {
                        console.log(results);
                        let insertId = results['insertId']
                        let labelsArray = []
                        labels.map((singleEle) => {
                            labelsArray.push([singleEle['Name'], singleEle['Confidence'], insertId])
                        })
                        console.log(labelsArray)

                        connection.query("INSERT INTO " + LABELS_TABLE + " VALUES ?",
                            [labelsArray]
                            , function (error, results, fields) {
                                if (error) {
                                    // console.error(error); 
                                    connection.release();
                                    reject(error);
                                }
                                else {
                                    connection.release();
                                    resolve(results);
                                }
                            })
                    }
                });
        });
    });

}

exports.handler = async (event) => {

    // Read options from the event.
    console.log("Reading options from event:\n", util.inspect(event, { depth: 5 }));
    var srcBucket = event.Records[0].s3.bucket.name;
    // Object key may have spaces or unicode non-ASCII characters.
    var srcKey =
        decodeURIComponent(event.Records[0].s3.object.key.replace(/\+/g, " "));
    var fileSize = event.Records[0].s3.object.size;
    var fileNameArr = srcKey.split('/');
    var fileName = fileNameArr[fileNameArr.length - 1];

    if(fileSize < 1) {
        console.log('File size is less than 1 byte so skipping it');
        return;
    }

    // destination info
    var dstBucket = DESTINATION_BUCKET
    var dstKey = srcKey;

    // preview info
    var previewBucket = PREVIEW_BUCKET
    var previewKey = srcKey;

    // pool 
    var pool = getRDSConnectionPool();

    if (srcBucket == dstBucket) {
        console.log("Source and destination buckets are the same.");
        return;
    }
    if (srcBucket == previewBucket) {
        console.log("Source and preview buckets are the same.");
        return;
    }
    // Infer the image type.
    var typeMatch = srcKey.match(/\.([^.]*)$/);
    if (!typeMatch) {
        console.log("Could not determine the image type.");
        return;
    }

    var imageType = typeMatch[1].toLowerCase();
    var response;
    try {
        if (/^.*(jpg|JPG|jpeg|JPEG|png|PNG)$/.test(imageType)) {
            console.log('Image type matched is ' + imageType);
            response = await getS3Object(srcBucket, srcKey);
        } else if (/^.*(gif|GIF|pdf|PDF)$/.test(imageType)) {
            console.log('Conversion in process');
            console.log('Image type matched is ' + imageType);
            response = await getS3Object(srcBucket, srcKey);
            response.ContentType = 'image/png';
            response.Body = await convertGifToPngAndPdf(response);
            let newKey = srcKey.substr(0, srcKey.lastIndexOf(".")) + ".png";
            imageType = 'png';
            dstKey = newKey;
            previewKey = newKey;
        } else if (/^.*(eps|EPS|eps2|EPS2|tiff|TIFF|svg|SVG|psd|PSD|ps|PS|psb|PSB|heic|HEIC|bmp|BMP|bmp2|BMP2|bmp3|BMP3)$/.test(imageType)) {
            console.log('Image type is ' + imageType);
            response = await getS3Object(srcBucket, srcKey);
            response.ContentType = 'image/png';
            response.Body = await convertFileToPng(response);
            let newKey = srcKey.substr(0, srcKey.lastIndexOf(".")) + ".png";
            imageType = 'png';
            dstKey = newKey;
            previewKey = newKey;
        } else {
            await insertUnProcessedFiles(pool, fileName, srcKey, fileSize, srcBucket);
            console.log('Format not supported');
            const response = {
                statusCode: 200,
                body: JSON.stringify('Succcesfully stored unprocessed files.'),
            };
            return response;
        }
    }
    catch (err) {
        console.error('Error in conversion block =======>', err);
        const error = new Error(err);
        throw error;
    }

    try {
        // promises
        let thumbnail = await createThumbnail(imageType, response);
        // uploading image to destination bucket
        // Stream the transformed image to a different S3 bucket.
        await putS3Object(dstBucket, dstKey, thumbnail, response);
        console.log(
            'Successfully created thumbnail ' + srcBucket + '/' + srcKey +
            ' and uploaded to ' + dstBucket + '/' + dstKey
        );

        let preview = await createPreview(imageType, response)
        // uploading image to destination bucket
        // Stream the transformed image to a different S3 bucket.
        await putS3Object(previewBucket, previewKey, preview, response);
        console.log(
            'Successfully created preview ' + srcBucket + '/' + srcKey +
            ' and uploaded to ' + previewBucket + '/' + previewKey
        );

    } catch (err) {
        console.error('Error in thumbnail or preview block =============>', err);
        const error = new Error(err);
        throw error;
    }

    try {
        let params = {
            Image: {
                S3Object: {
                    Bucket: previewBucket,
                    Name: previewKey
                }
            },
            MaxLabels: 123,
            MinConfidence: 70
        };

        let labels = await R.detectLabels(params).promise();

        console.log('Labels ===> ', labels);


        let pool = getRDSConnectionPool();

        await insertProcessedFiles(pool, labels['Labels'], fileName, srcKey, fileSize, srcBucket, dstBucket, dstKey, previewBucket, previewKey);


        const response = {
            statusCode: 200,
            body: JSON.stringify('Succcesfully converted and stored'),
        };
        return response;
        //             
    } catch (err) {
        console.error('Error in aws rekognition block =============>', err);
        const error = new Error(err);
        throw error;
    }

};
