const attendanceModel = require('../model/attendanceModel');
const employeeModel = require('../model/employee');
const axios = require('axios');
const haversine = require('haversine-distance');

// 23.188260840040723, 72.62826103671374 - LP
// 23.185913635378256, 72.62661952482908 - new boys hostel back side 
// 23.19101234264276, 72.62629765975367 - basket ball court
// 23.19062772740272, 72.63004202346438 - sac-2 side
// 23.185805150133376, 72.62931246262677 - relience chokdi side 
// 23.1902117,72.6280792 - Girls hostel

const companyLocation = { latitude: 23.1902117, longitude: 72.6280792  };
const companyRadius = 1350;

//Atendance Mark save in Database
async function markAttendance(emp_id, date) {
    try {
        const attendanceRecord = {
            date: date,
            status: "present",
        };

        let employee = await attendanceModel.findOne({ id: emp_id });
        
        console.log("Employee",employee);
        if (employee) {
            const updatedAttendance = await attendanceModel.updateOne(
                { id: emp_id },
                { $push: { attendance: attendanceRecord } }
            );
        } else {
            const newEmployee = new attendanceModel({
                id: emp_id,
                attendance: [attendanceRecord],
            });
            await newEmployee.save();
        }
    
        return true;
    } catch (error) {
        console.error("Error in markAttendance:", error);
        throw error;
    }

}

//Check for user mark attendace or not
async function alreadyMarked(emp_id, date) {
    try {

        console.log("data",date);
        const emp = await attendanceModel.findOne(
            {
                id: emp_id,
                attendance: {
                    $elemMatch: {
                        date: date,
                    },
                },
            },
            {
                "attendance.$": 1,
            }
        );

        if (emp && emp.attendance && emp.attendance.length > 0) {
            const status = emp.attendance[0].status;
            return status == "present";
        } else {
            return false;
        }
    } catch (error) {
        console.error("Error in alreadyMarked:", error);
        throw error;
    }
}

//Handle The markAttendace 
async function handleMarkAttendance(req, res) {
    try {
        const { id } = req.body;

        if (!id) {
            return res.status(400).send({ status:false , message: "Employee ID is required." });
        }

        if(! req.body.latitude || !req.body.longitude)
            return res.status(400).send({status:false , message:"Location required"});
        
        const emp = await employeeModel.findOne({ id });
        if (!emp) {
            return res.status(404).send({ status:false, message: "Employee with this ID not found." });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const indiaDateString = new Intl.DateTimeFormat('en-IN', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(today);

        const [day, month, year] = indiaDateString.split('/');
        const indiaDate = new Date(`${year}-${month}-${day}`);
    
        // console.log("India Time:", indiaDate);

        marked = await alreadyMarked(emp.id,indiaDate);
        if(marked){
            return res.status(409).send({
                status: false,
                message: "Your attendance has already been marked.",
            });
        }

        // console.log(`Employee ID: ${emp.id}`);

        const employeeLocation = { latitude: req.body.latitude , longitude: req.body.longitude };
        // console.log(employeeLocation);
        // console.log(companyLocation);

        // Calculate distance from company
        distance = haversine(companyLocation, employeeLocation);

        // console.log("dist: ",distance);
        if (distance > companyRadius) {
            return res.status(403).send({
                status:false,
                error: "Employee is outside the company area.",
                distance: `${Math.round(distance)} meters away.`,
            });
        }

        attendanceMarked = await markAttendance(emp.id,indiaDate);
        
        if(attendanceMarked)
        {
            return res.status(200).send({
                status:true,
                message: "Attendance marked successfully.",
            });
        }
        else{
            return res.status(500).send({
                status:false,
                message: "server not able to mark attendance",
            });
        }

    } catch (error) {
        console.error("Error in handleMarkAttendance:", error);
        return res.status(500).send({
            status:false,
            error: error.message,
        });
    }
}

//Employee Attendace fetch by ID
async function handleGetEmployeeAttendance(req,res){
    // console.log("Enter For Fetch Datas...")
    const { id } = req.params;  

    try { 
        const employee = await attendanceModel.findOne({id});
        // console.log("EMP",employee)
        if (!employee) { 
            return res.status(200).json({ success: true, attendance: [] });
        }

        res.status(200).json({ success: true, attendance: employee.attendance });
    } catch (error) {
        console.error("Error fetching attendance:", error);
        res.status(500).json({ success: false, message: "Error fetching attendance" });
    }
}

//Employee Absent List [register Date to today]
async function handleGetAbsentList(req,res){

    const { id } = req.params;
    // console.log("LId IS: ",id)

    const employee = await employeeModel.findOne({ id });
    if (!employee) {
        return res.status(404).send({
            status: false,
            message: "Employee with this ID not found."
        });
    }
    // console.log("EMP",employee)
    const attendanceRecord = await attendanceModel.findOne({ id });
    const joiningDate = new Date(employee.createdAt);
    const today = new Date();
    const totalDays = Math.floor((today - joiningDate) / (1000 * 60 * 60 * 24));

    // console.log("Total Days",totalDays)

    const absentDays = [];   
    for (let i = 0; i <= totalDays; i++) {
        const checkDate = new Date(joiningDate);
        checkDate.setDate(checkDate.getDate() + i);
        const dateStr = checkDate.toISOString().slice(0, 10);  
        //console.log("ATD->",attendanceRecord)
        const checkdays = attendanceRecord?.attendance.find(record => record.date === dateStr);
        const status = checkdays ? checkdays.status : "absent";
        if (status === "absent") {
            absentDays.push({
                date: dateStr,
                status: status
            });
        }
    }
    // console.log("AbDASYS:---->", absentDays)
    return res.status(200).json({
        status: true, 
        absentDays: absentDays
    });
}

//Get All Employee List id's with the percentage 
async function handleGetAllEmployeeDetails(req,res){

    try{
        // console.log('--------------------------------------------------------Come for Admin Updates--------------------------------------------------------')
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth();
        const currentYear = currentDate.getFullYear(); 
        const dayOfMonth = currentDate.getDate(); 

        const totalDaysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate(); 
        
        const employees = await attendanceModel.find();
        const attendanceData = employees.map(employee => {
        const presentDaysThisMonth = employee.attendance.filter(record => {
            const recordDate = new Date(record.date); 
            return (
              recordDate.getMonth() === currentMonth &&
              recordDate.getFullYear() === currentYear &&
                record.status === 'present'
            );
          }).length;        
        const attendancePercentage = (presentDaysThisMonth / dayOfMonth) * 100; 
        
        return {
          id: employee.id,
          attendancePercentage: attendancePercentage.toFixed(2), 
        };
      });
      res.status(200).json({
        success: true,
        message: 'Attendance data fetched successfully',
        data: attendanceData,
      });
  
    } catch (error) {
      console.error('Error fetching employee details:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: error.message,
      });
    }

}

 
module.exports = {
    handleMarkAttendance,
    handleGetEmployeeAttendance,
    handleGetAbsentList,
    handleGetAllEmployeeDetails
};